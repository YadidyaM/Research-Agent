import { LLMService } from '../services/llm.service';
import { MemoryStore } from './memory.store';
import { WebSearchTool } from '../tools/WebSearchTool';
import { ScraperTool } from '../tools/ScraperTool';
import { PythonExecutorTool } from '../tools/PythonExecutorTool';
import { MemoryTool } from '../tools/MemoryTool';
import { 
  AgentResponse, 
  AgentStep, 
  Tool, 
  WebSearchResult,
  ScrapedContent 
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export interface AgentTask {
  type: 'research' | 'analysis' | 'synthesis';
  query: string;
  options?: Record<string, any>;
  id?: string;
  status?: string;
  result?: any;
  error?: string;
  updatedAt?: Date;
}

export interface ResearchContext {
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
}

export class AgentRunner {
  private llmService: LLMService;
  private memoryStore: MemoryStore;
  private tools: Map<string, Tool>;
  private currentTask: AgentTask | null = null;
  private executionSteps: AgentStep[] = [];
  private webSearchTool: WebSearchTool;
  private scraperTool: ScraperTool;

  constructor() {
    this.llmService = new LLMService({
      provider: config.llm.provider,
      endpoint: config.llm.provider === 'deepseek' ? config.llm.deepseekBaseUrl : 
                config.llm.provider === 'openai' ? undefined : undefined,
      apiKey: config.llm.provider === 'openai' ? config.llm.openaiApiKey : 
              config.llm.provider === 'deepseek' ? config.llm.deepseekApiKey :
              config.llm.huggingfaceApiKey,
      model: config.llm.provider === 'deepseek' ? config.llm.deepseekModel :
             config.llm.provider === 'openai' ? config.llm.openaiModel :
             config.llm.openaiModel,
    });

    this.webSearchTool = new WebSearchTool({
      provider: config.tools.webSearch.provider as 'serpapi' | 'duckduckgo',
      apiKey: config.tools.webSearch.serpApiKey,
    });

    this.scraperTool = new ScraperTool({
      timeout: config.tools.scraper.timeout,
      userAgent: config.tools.scraper.userAgent,
    });

    // Initialize empty tools map and memory store for now
    this.tools = new Map();
    this.memoryStore = {} as MemoryStore; // Placeholder
  }

  async executeTask(task: AgentTask): Promise<ResearchContext> {
    this.currentTask = task;
    this.executionSteps = [];

    try {
      // Update task status
      task.status = 'running';
      task.updatedAt = new Date();

      // Add initial step
      this.addExecutionStep('task_start', 'Starting task execution', {
        taskId: task.id,
        taskType: task.type,
        query: task.query,
      });

      let result: any;

      switch (task.type) {
        case 'research':
          result = await this.executeResearchTask(task);
          break;
        
        case 'analysis':
          result = await this.executeAnalysisTask(task);
          break;
        
        case 'synthesis':
          result = await this.executeSynthesisTask(task);
          break;
        
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      // Update task status
      task.status = 'completed';
      task.result = result;
      task.updatedAt = new Date();

      // Store task in memory
      await this.memoryStore.storeExperience({
        context: `Task: ${task.type} - ${task.query}`,
        action: 'execute_task',
        result: JSON.stringify(result),
        success: true,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          stepsCount: this.executionSteps.length,
        },
      });

      this.addExecutionStep('task_complete', 'Task completed successfully', result);

      return result;

    } catch (error) {
      console.error('Task execution failed:', error);
      
      // Update task status
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.updatedAt = new Date();

      // Store failed task in memory
      await this.memoryStore.storeExperience({
        context: `Task: ${task.type} - ${task.query}`,
        action: 'execute_task',
        result: `Error: ${task.error}`,
        success: false,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          stepsCount: this.executionSteps.length,
        },
      });

      this.addExecutionStep('task_error', 'Task failed', {
        error: task.error,
      });

      throw error;
    }
  }

  private async executeResearchTask(task: AgentTask): Promise<ResearchContext> {
    const { query } = task;
    const context: ResearchContext = {
      query,
      findings: [],
      sources: [],
      synthesis: '',
      confidence: 0,
    };

    try {
      // Step 1: Generate research plan
      const plan = await this.llmService.generateResearchPlan(query);
      console.log('Research plan:', plan);

      // Step 2: Search for relevant sources
      const searchResults = await this.webSearchTool.execute({ query });
      context.sources = searchResults.map(result => result.url);

      // Step 3: Extract content from sources
      for (const result of searchResults.slice(0, 3)) { // Limit to top 3 sources
        try {
          const content = await this.scraperTool.execute({ url: result.url });
          const isRelevant = await this.llmService.isContentRelevant(content.content, query);
          
          if (isRelevant) {
            const keyPoints = await this.llmService.extractKeyPoints(content.content);
            context.findings.push(...keyPoints);
          }
        } catch (error) {
          console.error(`Failed to process ${result.url}:`, error);
        }
      }

      // Step 4: Synthesize findings
      if (context.findings.length > 0) {
        context.synthesis = await this.llmService.synthesizeFindings(context.findings);
        context.confidence = 0.8; // Basic confidence score
      } else {
        context.synthesis = 'No significant findings were discovered.';
        context.confidence = 0.1;
      }

      return context;
    } catch (error) {
      console.error('Research task failed:', error);
      throw error;
    }
  }

  private async executeAnalysisTask(task: AgentTask): Promise<any> {
    const { query } = task;

    this.addExecutionStep('analysis_start', 'Starting analysis task', { query });

    // Extract data requirements from query
    const dataRequirements = await this.llmService.generateText(
      `Analyze this request and identify what data or information is needed: ${query}`,
      { maxTokens: 500, temperature: 0.3 }
    );

    this.addExecutionStep('data_requirements', 'Identified data requirements', { 
      requirements: dataRequirements 
    });

    // Search for relevant data in memory
    const relevantData = await this.memoryStore.searchMemories(query, {
      limit: 20,
      threshold: 0.6,
    });

    // If we have data, analyze it
    if (relevantData.length > 0) {
      this.addExecutionStep('data_analysis', 'Analyzing available data', { 
        dataPoints: relevantData.length 
      });

      // Extract data for analysis
      const dataContent = relevantData.map(item => item.content).join('\n\n');
      
      // Use Python tool for analysis if needed
      const pythonTool = this.tools.get('python_executor') as PythonExecutorTool;
      
      try {
        const analysisCode = `
# Data Analysis
data_text = """${dataContent.replace(/"/g, '\\"')}"""

# Basic text analysis
import re
from collections import Counter

# Extract numbers
numbers = re.findall(r'\\b\\d+(?:\\.\\d+)?\\b', data_text)
numeric_data = [float(n) for n in numbers if n]

# Word frequency
words = re.findall(r'\\b\\w+\\b', data_text.lower())
word_freq = Counter(words)

print("=== Data Analysis Results ===")
print(f"Total data points: ${relevantData.length}")
print(f"Numeric values found: {len(numeric_data)}")
if numeric_data:
    print(f"Numeric range: {min(numeric_data):.2f} - {max(numeric_data):.2f}")
    print(f"Average: {sum(numeric_data)/len(numeric_data):.2f}")

print("\\nTop 10 most frequent words:")
for word, count in word_freq.most_common(10):
    print(f"{word}: {count}")
        `;

        const analysisResult = await pythonTool.execute({
          code: analysisCode,
          packages: ['re', 'collections'],
        });

        this.addExecutionStep('python_analysis', 'Performed Python analysis', {
          success: analysisResult.success,
          output: analysisResult.output,
        });

        // Generate insights using LLM
        const insights = await this.llmService.generateText(
          `Based on this analysis, provide key insights and conclusions: ${analysisResult.output}`,
          { maxTokens: 800, temperature: 0.4 }
        );

        return {
          query,
          dataPoints: relevantData.length,
          analysisResult: analysisResult.output,
          insights,
          confidence: 0.8,
        };

      } catch (error) {
        console.error('Python analysis failed:', error);
        
        // Fallback to LLM-only analysis
        const llmAnalysis = await this.llmService.generateText(
          `Analyze this data and provide insights: ${dataContent}`,
          { maxTokens: 1000, temperature: 0.4 }
        );

        return {
          query,
          dataPoints: relevantData.length,
          analysisResult: llmAnalysis,
          insights: llmAnalysis,
          confidence: 0.6,
        };
      }

    } else {
      // No data available - suggest data collection
      const suggestions = await this.llmService.generateText(
        `No data available for analysis: ${query}. Suggest how to collect relevant data.`,
        { maxTokens: 500, temperature: 0.3 }
      );

      return {
        query,
        dataPoints: 0,
        analysisResult: 'No data available for analysis',
        suggestions,
        confidence: 0.3,
      };
    }
  }

  private async executeSynthesisTask(task: AgentTask): Promise<any> {
    const { query } = task;

    this.addExecutionStep('synthesis_start', 'Starting synthesis task', { query });

    // Search for all relevant information
    const relevantInfo = await this.memoryStore.searchMemories(query, {
      limit: 50,
      threshold: 0.5,
    });

    this.addExecutionStep('information_gathering', 'Gathered relevant information', {
      infoCount: relevantInfo.length,
    });

    if (relevantInfo.length === 0) {
      return {
        query,
        synthesis: 'No relevant information found for synthesis.',
        confidence: 0.1,
        sources: [],
      };
    }

    // Group information by type
    const groupedInfo = {
      research: relevantInfo.filter(info => info.metadata?.type === 'research'),
      experience: relevantInfo.filter(info => info.metadata?.type === 'experience'),
      conversation: relevantInfo.filter(info => info.metadata?.type === 'conversation'),
      other: relevantInfo.filter(info => !['research', 'experience', 'conversation'].includes(info.metadata?.type)),
    };

    this.addExecutionStep('information_grouping', 'Grouped information by type', {
      research: groupedInfo.research.length,
      experience: groupedInfo.experience.length,
      conversation: groupedInfo.conversation.length,
      other: groupedInfo.other.length,
    });

    // Create synthesis for each group
    const syntheses: string[] = [];

    for (const [type, items] of Object.entries(groupedInfo)) {
      if (items.length > 0) {
        const content = items.map(item => item.content).join('\n\n');
        const synthesis = await this.llmService.synthesizeFindings(
          items.map(item => item.content)
        );
        syntheses.push(`**${type.charAt(0).toUpperCase() + type.slice(1)} Synthesis:**\n${synthesis}`);
      }
    }

    // Create overall synthesis
    const overallSynthesis = await this.llmService.synthesizeFindings(syntheses);

    this.addExecutionStep('synthesis_complete', 'Completed synthesis', {
      sectionsCount: syntheses.length,
    });

    const result = {
      query,
      synthesis: overallSynthesis,
      sections: syntheses,
      confidence: Math.min(0.9, relevantInfo.length / 20), // Max 0.9, scales with info count
      sources: relevantInfo.map(info => info.id),
      infoCount: relevantInfo.length,
    };

    // Store synthesis result
    await this.memoryStore.storeExperience({
      context: `Synthesis: ${query}`,
      action: 'synthesize_information',
      result: JSON.stringify(result),
      success: true,
      metadata: {
        infoCount: relevantInfo.length,
        confidence: result.confidence,
      },
    });

    return result;
  }

  private addExecutionStep(action: string, description: string, data?: any): void {
    const step: AgentStep = {
      step: this.executionSteps.length + 1,
      action,
      tool: undefined,
      input: description,
      output: data,
      timestamp: new Date(),
    };

    this.executionSteps.push(step);
  }

  async createTask(type: 'research' | 'analysis' | 'synthesis', query: string): Promise<AgentTask> {
    const task: AgentTask = {
      id: uuidv4(),
      type,
      query,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return task;
  }

  async getTaskStatus(taskId: string): Promise<AgentTask | null> {
    // In a real implementation, you'd store tasks in a database
    // For now, return the current task if it matches
    return this.currentTask?.id === taskId ? this.currentTask : null;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    if (this.currentTask?.id === taskId) {
      this.currentTask.status = 'failed';
      this.currentTask.error = 'Task cancelled by user';
      this.currentTask.updatedAt = new Date();
      return true;
    }
    return false;
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  async getToolCapabilities(toolName: string): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Return tool-specific capabilities
    switch (toolName) {
      case 'web_search':
        return (tool as WebSearchTool).getSearchMetrics();
      case 'python_executor':
        return (tool as PythonExecutorTool).getCapabilities();
      default:
        return { name: tool.name, description: tool.description };
    }
  }

  async health(): Promise<{
    status: string;
    tools: Record<string, boolean>;
    memory: boolean;
  }> {
    const toolsHealth: Record<string, boolean> = {};
    
    for (const [name, tool] of this.tools) {
      try {
        toolsHealth[name] = await tool.health ? tool.health() : true;
      } catch {
        toolsHealth[name] = false;
      }
    }

    const memoryHealth = await this.memoryStore.health();
    const overallHealth = Object.values(toolsHealth).every(h => h) && memoryHealth;

    return {
      status: overallHealth ? 'healthy' : 'degraded',
      tools: toolsHealth,
      memory: memoryHealth,
    };
  }
} 