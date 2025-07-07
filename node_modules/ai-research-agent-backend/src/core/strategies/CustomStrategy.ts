import { v4 as uuidv4 } from 'uuid';

import { AgentStrategy, AgentConfig, ExecutionContext, ExecutionResult } from './AgentStrategy';
import { AgentStep } from '../../types';
import { config } from '../../config';

// Service imports
import { LLMService } from '../../services/llm.service';
import { MemoryStore } from '../memory.store';
import { ServiceFactory } from '../../services/ServiceFactory';

// Tool imports
import { WebSearchTool } from '../../tools/WebSearchTool';
import { ScraperTool } from '../../tools/ScraperTool';
import { PythonExecutorTool } from '../../tools/PythonExecutorTool';
import { PDFParserTool } from '../../tools/PDFParserTool';
import { MemoryTool } from '../../tools/MemoryTool';

interface CustomAgentTask {
  id: string;
  type: 'research' | 'analysis' | 'synthesis';
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomStrategy extends AgentStrategy {
  private llmService: LLMService;
  private memoryStore: MemoryStore;
  private webSearchTool: WebSearchTool;
  private scraperTool: ScraperTool;
  private pythonTool: PythonExecutorTool;
  private pdfTool: PDFParserTool;
  private memoryTool: MemoryTool | null = null;
  private currentTask: CustomAgentTask | null = null;
  private executionSteps: AgentStep[] = [];
  private chatHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [];

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);
    this.initializeServices();
  }

  private initializeServices(): void {
    // Initialize LLM Service
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

    // Initialize tools
    this.webSearchTool = new WebSearchTool({
      provider: config.tools.webSearch.provider as 'tavily' | 'serpapi' | 'duckduckgo',
      ...(config.tools.webSearch.serpApiKey && { apiKey: config.tools.webSearch.serpApiKey }),
      ...(config.tools.webSearch.tavilyApiKey && { tavilyApiKey: config.tools.webSearch.tavilyApiKey }),
    });

    this.scraperTool = new ScraperTool({
      timeout: this.config.timeout,
      userAgent: config.tools.scraper.userAgent,
    });

    this.pythonTool = new PythonExecutorTool({
      timeout: this.config.timeout,
      sandboxed: true,
      endpoint: config.tools.python.endpoint,
    });

    this.pdfTool = new PDFParserTool({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      timeout: this.config.timeout,
    });

    // Initialize memory store
    this.memoryStore = new MemoryStore();
  }

  async initialize(): Promise<void> {
    if (this.config.enableMemory) {
      try {
        // Initialize MemoryStore
        await this.memoryStore.initialize();
        
        // Initialize MemoryTool with proper dependencies
        console.log('🧠 Initializing memory tool for Custom strategy...');
        const serviceFactory = ServiceFactory.getInstance();
        await serviceFactory.initialize();
        this.memoryTool = serviceFactory.getMemoryTool();
        console.log('✅ Memory tool initialized successfully');
      } catch (error) {
        console.warn('⚠️ Memory initialization failed, continuing without memory:', error);
        this.memoryTool = null;
      }
    }
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    await this.initialize();

    // Create task
    const task: CustomAgentTask = {
      id: uuidv4(),
      type: context.taskType as 'research' | 'analysis' | 'synthesis',
      query: context.query,
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.currentTask = task;
    this.executionSteps = [];

    const addStep = (step: AgentStep) => {
      this.executionSteps.push(step);
      context.onStep?.(step);
    };

    try {
      // Initial step
      addStep({
        id: uuidv4(),
        step: 'task_start',
        status: 'running',
        description: 'Starting custom agent execution',
        data: { taskId: task.id, taskType: task.type, query: task.query },
        timestamp: new Date()
      });

      let result: ExecutionResult;

      switch (task.type) {
        case 'research':
          result = await this.executeResearchTask(context, addStep);
          break;
        case 'analysis':
          result = await this.executeAnalysisTask(context, addStep);
          break;
        case 'synthesis':
          result = await this.executeSynthesisTask(context, addStep);
          break;
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      // Update task status
      task.status = 'completed';
      task.result = result;
      task.updatedAt = new Date();

      // Store task in memory if enabled
      if (this.config.enableMemory) {
        try {
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
        } catch (error) {
          console.warn('Failed to store experience in memory:', error);
        }
      }

      addStep({
        id: uuidv4(),
        step: 'task_complete',
        status: 'completed',
        description: 'Custom agent execution completed successfully',
        data: result,
        timestamp: new Date()
      });

      result.executionTime = Date.now() - startTime;
      result.steps = this.executionSteps;

      return result;

    } catch (error) {
      console.error('Custom agent execution failed:', error);
      
      // Update task status
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.updatedAt = new Date();

      // Store failed task in memory if enabled
      if (this.config.enableMemory) {
        try {
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
        } catch (memoryError) {
          console.warn('Failed to store failed experience in memory:', memoryError);
        }
      }

      addStep({
        id: uuidv4(),
        step: 'task_error',
        status: 'error',
        description: 'Custom agent execution failed',
        data: { error: task.error },
        timestamp: new Date()
      });

      throw error;
    }
  }

  private async executeResearchTask(
    context: ExecutionContext, 
    addStep: (step: AgentStep) => void
  ): Promise<ExecutionResult> {
    const executionResult: ExecutionResult = {
      query: context.query,
      findings: [],
      sources: [],
      synthesis: '',
      confidence: 0,
      steps: [],
      executionTime: 0,
      metadata: { strategy: 'custom' }
    };

    try {
      // Step 1: Generate research plan
      const planStep = addStep({
        id: uuidv4(),
        step: 'planning',
        status: 'running',
        description: 'Generating research plan using AI...',
        timestamp: new Date()
      });
      
      context.onThought?.('🧠 Planning research approach...');
      const plan = await this.llmService.generateResearchPlan(context.query);
      
      planStep.status = 'completed';
      planStep.data = { plan };
      
      context.onThought?.('📋 Research plan created');

      // Step 2: Check memory for similar research
      if (this.memoryTool && this.config.enableMemory) {
        try {
          const memorySearchStep = addStep({
            id: uuidv4(),
            step: 'memory_search',
            status: 'running',
            description: 'Searching memory for similar research...',
            timestamp: new Date()
          });
          
          context.onThought?.('🔍 Checking memory for related research...');
          const similarResearch = await this.memoryTool.searchSimilarResearch(context.query, 3);
          
          if (similarResearch.length > 0) {
            // Add relevant findings from memory to results
            const memoryFindings = similarResearch.map(res => 
              `Previous research: ${res.content.substring(0, 200)}...`
            );
            executionResult.findings.push(...memoryFindings);
            
            memorySearchStep.status = 'completed';
            memorySearchStep.data = { found: similarResearch.length, results: similarResearch };
            context.onThought?.(`✅ Found ${similarResearch.length} related research items in memory`);
          } else {
            memorySearchStep.status = 'completed';
            memorySearchStep.data = { found: 0 };
            context.onThought?.('📝 No similar research found in memory');
          }
        } catch (error) {
          console.warn('Memory search failed:', error);
        }
      }

      // Step 3: Search for relevant sources
      const searchStep = addStep({
        id: uuidv4(),
        step: 'searching',
        status: 'running',
        description: 'Searching the web for relevant sources...',
        timestamp: new Date()
      });
      
      context.onThought?.('🔍 Searching for sources...');
      const searchResults = await this.webSearchTool.execute({ 
        query: context.query,
        maxResults: 10 
      });
      
      executionResult.sources = searchResults.map(result => result.url);
      searchStep.status = 'completed';
      searchStep.data = { results: searchResults, count: searchResults.length };
      
      context.onThought?.(`✅ Found ${searchResults.length} sources`);

      // Step 3: Extract content from sources
      const scrapingStep = addStep({
        id: uuidv4(),
        step: 'content_extraction',
        status: 'running',
        description: `Analyzing content from top ${Math.min(3, searchResults.length)} sources...`,
        timestamp: new Date()
      });
      
      context.onThought?.('📄 Extracting content...');
      let successfulExtractions = 0;

      for (const result of searchResults.slice(0, 3)) { // Limit to top 3 sources
        try {
          const content = await this.scraperTool.execute({ url: result.url });
          const isRelevant = await this.llmService.isContentRelevant(content.content, context.query);
          
          if (isRelevant) {
            const keyPoints = await this.llmService.extractKeyPoints(content.content);
            executionResult.findings.push(...keyPoints);
            successfulExtractions++;
          }
        } catch (error) {
          console.error(`Failed to process ${result.url}:`, error);
        }
      }

      scrapingStep.status = 'completed';
      scrapingStep.data = { 
        processedCount: Math.min(3, searchResults.length),
        successfulExtractions,
        findingsCount: executionResult.findings.length
      };
      
      context.onThought?.(`📊 Extracted ${executionResult.findings.length} key findings`);

      // Step 4: Synthesize findings
      const synthesisStep = addStep({
        id: uuidv4(),
        step: 'synthesis',
        status: 'running',
        description: 'Synthesizing research findings...',
        timestamp: new Date()
      });
      
      context.onThought?.('🧩 Synthesizing findings...');
      
      if (executionResult.findings.length > 0) {
        executionResult.synthesis = await this.llmService.synthesizeFindings(executionResult.findings);
        executionResult.confidence = Math.min(0.9, Math.max(0.3, 
          (executionResult.findings.length * 0.1) + (successfulExtractions * 0.2)
        ));
      } else {
        executionResult.synthesis = 'No significant findings were discovered from the available sources.';
        executionResult.confidence = 0.1;
      }

      synthesisStep.status = 'completed';
      synthesisStep.data = { 
        synthesis: executionResult.synthesis,
        confidence: executionResult.confidence
      };
      
      context.onThought?.(`✅ Research synthesis complete (${Math.round(executionResult.confidence * 100)}% confidence)`);

      // Store findings in memory if available
      if (this.memoryTool && this.config.enableMemory && executionResult.findings.length > 0) {
        try {
          const memoryStep = addStep({
            id: uuidv4(),
            step: 'memory_storage',
            status: 'running',
            description: 'Storing research findings in memory...',
            timestamp: new Date()
          });
          
          context.onThought?.('💾 Storing findings in memory...');
          
          await this.memoryTool.storeResearchFindings({
            query: context.query,
            sources: executionResult.sources,
            content: executionResult.synthesis,
            summary: executionResult.findings.join('; '),
            metadata: {
              confidence: executionResult.confidence,
              timestamp: new Date().toISOString(),
              strategy: 'custom',
              findingsCount: executionResult.findings.length
            }
          });

          memoryStep.status = 'completed';
          memoryStep.data = { stored: true, findingsCount: executionResult.findings.length };
          context.onThought?.('✅ Research findings stored in memory');
        } catch (error) {
          console.warn('Failed to store research findings in memory:', error);
        }
      }

      // Create search results for UI
      executionResult.searchResults = searchResults.slice(0, 5).map((source, index) => ({
        id: `result-${index}`,
        title: source.title,
        url: source.url,
        description: source.snippet || `Source found during research about ${context.query}`,
        snippet: source.snippet || 'This source contains relevant information for your research query.',
        domain: this.extractDomain(source.url)
      }));

      return executionResult;

    } catch (error) {
      console.error('Research task failed:', error);
      throw error;
    }
  }

  private async executeAnalysisTask(
    context: ExecutionContext, 
    addStep: (step: AgentStep) => void
  ): Promise<ExecutionResult> {
    // TODO: Implement analysis logic
    const executionResult: ExecutionResult = {
      query: context.query,
      findings: [`Analysis task for: ${context.query}`],
      sources: [],
      synthesis: `Analysis of "${context.query}" has been completed using the custom strategy.`,
      confidence: 0.7,
      steps: [],
      executionTime: 0,
      metadata: { strategy: 'custom', taskType: 'analysis' }
    };

    addStep({
      id: uuidv4(),
      step: 'analysis_placeholder',
      status: 'completed',
      description: 'Analysis functionality placeholder',
      data: executionResult,
      timestamp: new Date()
    });

    return executionResult;
  }

  private async executeSynthesisTask(
    context: ExecutionContext, 
    addStep: (step: AgentStep) => void
  ): Promise<ExecutionResult> {
    // TODO: Implement synthesis logic
    const executionResult: ExecutionResult = {
      query: context.query,
      findings: [`Synthesis task for: ${context.query}`],
      sources: [],
      synthesis: `Synthesis of "${context.query}" has been completed using the custom strategy.`,
      confidence: 0.8,
      steps: [],
      executionTime: 0,
      metadata: { strategy: 'custom', taskType: 'synthesis' }
    };

    addStep({
      id: uuidv4(),
      step: 'synthesis_placeholder',
      status: 'completed',
      description: 'Synthesis functionality placeholder',
      data: executionResult,
      timestamp: new Date()
    });

    return executionResult;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  async chat(message: string, onStep?: (step: AgentStep) => void): Promise<string> {
    try {
      // Store user message in chat history
      if (this.config.enableMemory) {
        this.chatHistory.push({
          role: 'user',
          content: message,
          timestamp: new Date()
        });
      }

      // Generate response using LLM service
      const response = await this.llmService.generateResponse(message);

      // Store assistant response in chat history
      if (this.config.enableMemory) {
        this.chatHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });

        // Keep chat history manageable
        if (this.chatHistory.length > 20) {
          this.chatHistory = this.chatHistory.slice(-20);
        }
      }

      return response;

    } catch (error) {
      console.error('Chat execution failed:', error);
      throw error;
    }
  }

  async health(): Promise<{
    status: string;
    tools: Record<string, boolean>;
    memory: boolean;
    agent: boolean;
  }> {
    const toolsHealth = await Promise.allSettled([
      this.webSearchTool.execute({ query: 'test' }).then(() => true).catch(() => false),
      this.scraperTool.health ? this.scraperTool.health() : Promise.resolve(true),
      this.pythonTool.health ? this.pythonTool.health() : Promise.resolve(true),
      this.pdfTool.health ? this.pdfTool.health() : Promise.resolve(true)
    ]);

    const toolsStatus = {
      web_search: toolsHealth[0].status === 'fulfilled' ? toolsHealth[0].value : false,
      scraper: toolsHealth[1].status === 'fulfilled' ? toolsHealth[1].value : false,
      python: toolsHealth[2].status === 'fulfilled' ? toolsHealth[2].value : false,
      pdf_parser: toolsHealth[3].status === 'fulfilled' ? toolsHealth[3].value : false
    };

    const memoryHealth = this.config.enableMemory ? await this.memoryStore.health() : true;
    const overallHealth = Object.values(toolsStatus).every(h => h) && memoryHealth;

    return {
      status: overallHealth ? 'healthy' : 'degraded',
      tools: toolsStatus,
      memory: memoryHealth,
      agent: true,
    };
  }

  async cleanup(): Promise<void> {
    this.chatHistory = [];
    this.executionSteps = [];
    this.currentTask = null;
    this.memoryTool = null;
  }

  clearMemory(): void {
    this.chatHistory = [];
    this.executionSteps = [];
  }

  getMemory(): Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> {
    return [...this.chatHistory];
  }

  getAvailableTools(): string[] {
    const tools = ['web_search', 'scraper', 'python_executor', 'pdf_parser'];
    if (this.memoryTool && this.config.enableMemory) {
      tools.push('memory');
    }
    return tools;
  }

  async getToolCapabilities(toolName: string): Promise<any> {
    switch (toolName) {
      case 'web_search':
        return {
          name: 'web_search',
          description: 'Search the web for information',
          provider: config.tools.webSearch.provider,
          strategy: 'custom'
        };
      case 'scraper':
        return {
          name: 'scraper',
          description: 'Extract content from web pages',
          timeout: this.config.timeout,
          strategy: 'custom'
        };
      case 'python_executor':
        return this.pythonTool.getCapabilities ? this.pythonTool.getCapabilities() : {
          name: 'python_executor',
          description: 'Execute Python code for analysis',
          strategy: 'custom'
        };
      case 'pdf_parser':
        return {
          name: 'pdf_parser',
          description: 'Parse and extract text from PDF files',
          strategy: 'custom'
        };
      case 'memory':
        return {
          name: 'memory',
          description: 'Store and retrieve information from long-term memory using vector search',
          strategy: 'custom',
          available: this.memoryTool !== null
        };
      default:
        throw new Error(`Tool not found: ${toolName}`);
    }
  }
} 