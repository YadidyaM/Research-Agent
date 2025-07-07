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
    const executionResult: ExecutionResult = {
      query: context.query,
      findings: [],
      sources: [],
      synthesis: '',
      confidence: 0,
      steps: [],
      executionTime: 0,
      metadata: { strategy: 'custom', taskType: 'analysis' }
    };

    try {
      // Step 1: Analyze the query to understand what type of analysis is needed
      const queryAnalysisStep = addStep({
        id: uuidv4(),
        step: 'query_analysis',
        status: 'running',
        description: 'Analyzing query to determine analysis approach...',
        timestamp: new Date()
      });

      context.onThought?.('🧠 Understanding analysis requirements...');
      
      const analysisType = await this.determineAnalysisType(context.query);
      queryAnalysisStep.status = 'completed';
      queryAnalysisStep.data = { analysisType };
      
      context.onThought?.(`📊 Analysis type identified: ${analysisType}`);

      // Step 2: Check memory for existing analysis or related data
      let existingData: any[] = [];
      if (this.memoryTool && this.config.enableMemory) {
        const memorySearchStep = addStep({
          id: uuidv4(),
          step: 'memory_search',
          status: 'running',
          description: 'Searching for existing analysis and data...',
          timestamp: new Date()
        });

        context.onThought?.('🔍 Searching memory for related analysis...');
        
        try {
          const memoryResults = await this.memoryTool.execute({ 
            action: 'search', 
            query: context.query,
            limit: 10 
          });
          
          if (memoryResults && Array.isArray(memoryResults)) {
            existingData = memoryResults;
            executionResult.findings.push(`Found ${existingData.length} related items in memory`);
          }

          memorySearchStep.status = 'completed';
          memorySearchStep.data = { found: existingData.length };
          context.onThought?.(`✅ Found ${existingData.length} related items in memory`);
        } catch (error) {
          console.warn('Memory search failed:', error);
          memorySearchStep.status = 'completed';
          memorySearchStep.data = { found: 0, error: error.message };
        }
      }

      // Step 3: Gather additional data if needed
      let analysisData: any[] = [...existingData];
      
      if (analysisType.needsExternalData) {
        const dataGatheringStep = addStep({
          id: uuidv4(),
          step: 'data_gathering',
          status: 'running',
          description: 'Gathering additional data for analysis...',
          timestamp: new Date()
        });

        context.onThought?.('🔍 Gathering additional data...');

        try {
          // Search for relevant information
          const searchResults = await this.webSearchTool.execute({ 
            query: `${context.query} data analysis statistics trends`,
            maxResults: 5 
          });

          executionResult.sources = searchResults.map(result => result.url);

          // Extract content from top sources
          for (const result of searchResults.slice(0, 3)) {
            try {
              const content = await this.scraperTool.execute({ url: result.url });
              
              // Extract structured data and key points
              const extractedData = await this.extractAnalysisData(content.content, context.query);
              if (extractedData.length > 0) {
                analysisData.push(...extractedData);
              }
            } catch (error) {
              console.warn(`Failed to extract data from ${result.url}:`, error);
            }
          }

          dataGatheringStep.status = 'completed';
          dataGatheringStep.data = { 
            sourcesFound: searchResults.length,
            dataPointsExtracted: analysisData.length - existingData.length
          };
          
          context.onThought?.(`📊 Gathered ${analysisData.length - existingData.length} additional data points`);
        } catch (error) {
          console.warn('Data gathering failed:', error);
          dataGatheringStep.status = 'completed';
          dataGatheringStep.data = { error: error.message };
        }
      }

      // Step 4: Perform the analysis
      const analysisStep = addStep({
        id: uuidv4(),
        step: 'data_analysis',
        status: 'running',
        description: 'Performing comprehensive analysis...',
        timestamp: new Date()
      });

      context.onThought?.('🔬 Performing data analysis...');

      const analysisResults = await this.performDataAnalysis(analysisData, context.query, analysisType);
      
      executionResult.findings = analysisResults.findings;
      executionResult.confidence = analysisResults.confidence;

      analysisStep.status = 'completed';
      analysisStep.data = analysisResults;
      
      context.onThought?.(`✅ Analysis complete with ${analysisResults.findings.length} insights`);

      // Step 5: Generate Python analysis if needed
      if (analysisType.needsComputation && analysisData.length > 0) {
        const computationStep = addStep({
          id: uuidv4(),
          step: 'computational_analysis',
          status: 'running',
          description: 'Running computational analysis...',
          timestamp: new Date()
        });

        context.onThought?.('⚡ Running computational analysis...');

        try {
          const pythonCode = await this.generateAnalysisCode(analysisData, context.query);
          const computationResult = await this.pythonTool.execute({ code: pythonCode });
          
          if (computationResult.output) {
            executionResult.findings.push(`Computational Analysis: ${computationResult.output}`);
          }

          computationStep.status = 'completed';
          computationStep.data = { 
            codeExecuted: true, 
            output: computationResult.output,
            hasError: !!computationResult.error
          };
          
          context.onThought?.('✅ Computational analysis complete');
        } catch (error) {
          console.warn('Computational analysis failed:', error);
          computationStep.status = 'completed';
          computationStep.data = { error: error.message };
        }
      }

      // Step 6: Generate comprehensive synthesis
      const synthesisStep = addStep({
        id: uuidv4(),
        step: 'synthesis',
        status: 'running',
        description: 'Generating comprehensive analysis report...',
        timestamp: new Date()
      });

      context.onThought?.('📝 Generating analysis report...');

      if (executionResult.findings.length > 0) {
        executionResult.synthesis = await this.generateAnalysisSynthesis(
          executionResult.findings, 
          context.query, 
          analysisType
        );
      } else {
        executionResult.synthesis = `Analysis of "${context.query}" could not be completed due to insufficient data.`;
        executionResult.confidence = 0.1;
      }

      synthesisStep.status = 'completed';
      synthesisStep.data = { 
        synthesis: executionResult.synthesis,
        confidence: executionResult.confidence
      };

      context.onThought?.(`✅ Analysis synthesis complete (${Math.round(executionResult.confidence * 100)}% confidence)`);

      // Step 7: Store analysis results in memory
      if (this.memoryTool && this.config.enableMemory && executionResult.findings.length > 0) {
        try {
          const memoryStep = addStep({
            id: uuidv4(),
            step: 'memory_storage',
            status: 'running',
            description: 'Storing analysis results in memory...',
            timestamp: new Date()
          });

          context.onThought?.('💾 Storing analysis in memory...');

          await this.memoryTool.execute({
            action: 'store',
            content: executionResult.synthesis,
            metadata: {
              type: 'analysis',
              query: context.query,
              analysisType: analysisType.type,
              confidence: executionResult.confidence,
              timestamp: new Date().toISOString(),
              findingsCount: executionResult.findings.length
            }
          });

          memoryStep.status = 'completed';
          memoryStep.data = { stored: true };
          context.onThought?.('✅ Analysis stored in memory');
        } catch (error) {
          console.warn('Failed to store analysis in memory:', error);
        }
      }

      return executionResult;

    } catch (error) {
      console.error('Analysis task failed:', error);
      throw error;
    }
  }

  private async executeSynthesisTask(
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
      metadata: { strategy: 'custom', taskType: 'synthesis' }
    };

    try {
      // Step 1: Parse synthesis requirements from query
      const requirementsStep = addStep({
        id: uuidv4(),
        step: 'requirements_analysis',
        status: 'running',
        description: 'Analyzing synthesis requirements...',
        timestamp: new Date()
      });

      context.onThought?.('🧠 Understanding synthesis requirements...');
      
      const synthesisRequirements = await this.parseSynthesisRequirements(context.query);
      requirementsStep.status = 'completed';
      requirementsStep.data = { requirements: synthesisRequirements };
      
      context.onThought?.(`📋 Synthesis approach: ${synthesisRequirements.approach}`);

      // Step 2: Gather source materials from memory and external sources
      let sourceMaterials: any[] = [];
      
      // Search memory for relevant information
      if (this.memoryTool && this.config.enableMemory) {
        const memorySearchStep = addStep({
          id: uuidv4(),
          step: 'memory_source_gathering',
          status: 'running',
          description: 'Gathering source materials from memory...',
          timestamp: new Date()
        });

        context.onThought?.('🔍 Searching memory for source materials...');

        try {
          // Search for multiple related topics if synthesis involves multiple concepts
          const searchQueries = synthesisRequirements.concepts.length > 1 
            ? synthesisRequirements.concepts 
            : [context.query];

          for (const query of searchQueries) {
            const memoryResults = await this.memoryTool.execute({ 
              action: 'search', 
              query: query,
              limit: 5 
            });
            
            if (memoryResults && Array.isArray(memoryResults)) {
              sourceMaterials.push(...memoryResults.map(result => ({
                ...result,
                source: 'memory',
                searchQuery: query
              })));
            }
          }

          memorySearchStep.status = 'completed';
          memorySearchStep.data = { found: sourceMaterials.length };
          context.onThought?.(`📚 Found ${sourceMaterials.length} source materials in memory`);
        } catch (error) {
          console.warn('Memory search failed:', error);
          memorySearchStep.status = 'completed';
          memorySearchStep.data = { found: 0, error: error.message };
        }
      }

      // Gather additional external sources if needed
      if (synthesisRequirements.needsExternalSources) {
        const externalSearchStep = addStep({
          id: uuidv4(),
          step: 'external_source_gathering',
          status: 'running',
          description: 'Gathering external source materials...',
          timestamp: new Date()
        });

        context.onThought?.('🌐 Gathering external sources...');

        try {
          const searchResults = await this.webSearchTool.execute({ 
            query: context.query,
            maxResults: 8 
          });

          executionResult.sources = searchResults.map(result => result.url);

          // Extract content from relevant sources
          for (const result of searchResults.slice(0, 4)) {
            try {
              const content = await this.scraperTool.execute({ url: result.url });
              
              // Check relevance and extract key content
              const isRelevant = await this.llmService.isContentRelevant(content.content, context.query);
              if (isRelevant) {
                const keyPoints = await this.llmService.extractKeyPoints(content.content);
                sourceMaterials.push({
                  content: content.content,
                  title: content.title || result.title,
                  url: result.url,
                  keyPoints: keyPoints,
                  source: 'external',
                  relevanceScore: await this.calculateRelevanceScore(content.content, context.query)
                });
              }
            } catch (error) {
              console.warn(`Failed to extract content from ${result.url}:`, error);
            }
          }

          externalSearchStep.status = 'completed';
          externalSearchStep.data = { 
            sourcesFound: searchResults.length,
            relevantSources: sourceMaterials.filter(m => m.source === 'external').length
          };
          
          context.onThought?.(`🌐 Processed ${sourceMaterials.filter(m => m.source === 'external').length} external sources`);
        } catch (error) {
          console.warn('External source gathering failed:', error);
          externalSearchStep.status = 'completed';
          externalSearchStep.data = { error: error.message };
        }
      }

      // Step 3: Organize and categorize source materials
      const organizationStep = addStep({
        id: uuidv4(),
        step: 'content_organization',
        status: 'running',
        description: 'Organizing and categorizing source materials...',
        timestamp: new Date()
      });

      context.onThought?.('📊 Organizing source materials...');

      const organizedContent = await this.organizeContentForSynthesis(sourceMaterials, synthesisRequirements);
      organizationStep.status = 'completed';
      organizationStep.data = { 
        categories: Object.keys(organizedContent),
        totalItems: sourceMaterials.length
      };
      
      context.onThought?.(`📚 Organized content into ${Object.keys(organizedContent).length} categories`);

      // Step 4: Identify patterns and connections
      const patternAnalysisStep = addStep({
        id: uuidv4(),
        step: 'pattern_analysis',
        status: 'running',
        description: 'Identifying patterns and connections...',
        timestamp: new Date()
      });

      context.onThought?.('🔍 Analyzing patterns and connections...');

      const patterns = await this.identifyPatternsAndConnections(organizedContent, context.query);
      executionResult.findings.push(...patterns);

      patternAnalysisStep.status = 'completed';
      patternAnalysisStep.data = { 
        patternsFound: patterns.length,
        patterns: patterns.slice(0, 3) // Preview first 3 patterns
      };
      
      context.onThought?.(`🧩 Identified ${patterns.length} patterns and connections`);

      // Step 5: Generate synthesis framework
      const frameworkStep = addStep({
        id: uuidv4(),
        step: 'synthesis_framework',
        status: 'running',
        description: 'Creating synthesis framework...',
        timestamp: new Date()
      });

      context.onThought?.('🏗️ Creating synthesis framework...');

      const synthesisFramework = await this.createSynthesisFramework(
        organizedContent, 
        patterns, 
        synthesisRequirements
      );

      frameworkStep.status = 'completed';
      frameworkStep.data = { framework: synthesisFramework };
      
      context.onThought?.('✅ Synthesis framework created');

      // Step 6: Generate comprehensive synthesis
      const synthesisGenerationStep = addStep({
        id: uuidv4(),
        step: 'synthesis_generation',
        status: 'running',
        description: 'Generating comprehensive synthesis...',
        timestamp: new Date()
      });

      context.onThought?.('✍️ Generating comprehensive synthesis...');

      if (sourceMaterials.length > 0) {
        executionResult.synthesis = await this.generateComprehensiveSynthesis(
          organizedContent,
          patterns,
          synthesisFramework,
          context.query,
          synthesisRequirements
        );
        
        // Calculate confidence based on source quality and coverage
        executionResult.confidence = this.calculateSynthesisConfidence(
          sourceMaterials,
          patterns,
          synthesisRequirements
        );
      } else {
        executionResult.synthesis = `Synthesis of "${context.query}" could not be completed due to insufficient source materials.`;
        executionResult.confidence = 0.1;
      }

      synthesisGenerationStep.status = 'completed';
      synthesisGenerationStep.data = { 
        synthesisLength: executionResult.synthesis.length,
        confidence: executionResult.confidence
      };

      context.onThought?.(`✅ Synthesis complete (${Math.round(executionResult.confidence * 100)}% confidence)`);

      // Step 7: Generate additional insights if needed
      if (synthesisRequirements.needsInsights && sourceMaterials.length > 0) {
        const insightsStep = addStep({
          id: uuidv4(),
          step: 'insights_generation',
          status: 'running',
          description: 'Generating additional insights...',
          timestamp: new Date()
        });

        context.onThought?.('💡 Generating additional insights...');

        try {
          const additionalInsights = await this.generateAdditionalInsights(
            organizedContent,
            patterns,
            context.query
          );
          
          executionResult.findings.push(...additionalInsights);

          insightsStep.status = 'completed';
          insightsStep.data = { insightsGenerated: additionalInsights.length };
          
          context.onThought?.(`💡 Generated ${additionalInsights.length} additional insights`);
        } catch (error) {
          console.warn('Failed to generate additional insights:', error);
          insightsStep.status = 'completed';
          insightsStep.data = { error: error.message };
        }
      }

      // Step 8: Store synthesis in memory
      if (this.memoryTool && this.config.enableMemory && executionResult.synthesis) {
        try {
          const memoryStep = addStep({
            id: uuidv4(),
            step: 'memory_storage',
            status: 'running',
            description: 'Storing synthesis in memory...',
            timestamp: new Date()
          });

          context.onThought?.('💾 Storing synthesis in memory...');

          await this.memoryTool.execute({
            action: 'store',
            content: executionResult.synthesis,
            metadata: {
              type: 'synthesis',
              query: context.query,
              approach: synthesisRequirements.approach,
              confidence: executionResult.confidence,
              sourcesUsed: sourceMaterials.length,
              patternsIdentified: patterns.length,
              timestamp: new Date().toISOString()
            }
          });

          memoryStep.status = 'completed';
          memoryStep.data = { stored: true };
          context.onThought?.('✅ Synthesis stored in memory');
        } catch (error) {
          console.warn('Failed to store synthesis in memory:', error);
        }
      }

      // Create search results for UI if available
      if (executionResult.sources.length > 0) {
        executionResult.searchResults = executionResult.sources.slice(0, 5).map((url, index) => ({
          id: `synthesis-result-${index}`,
          title: sourceMaterials.find(m => m.url === url)?.title || `Source ${index + 1}`,
          url: url,
          description: `Source material used for synthesis about ${context.query}`,
          snippet: sourceMaterials.find(m => m.url === url)?.keyPoints?.[0] || 'Relevant content for synthesis',
          domain: this.extractDomain(url)
        }));
      }

      return executionResult;

    } catch (error) {
      console.error('Synthesis task failed:', error);
      throw error;
    }
  }

  // Helper methods for analysis functionality
  private async determineAnalysisType(query: string): Promise<{
    type: string;
    needsExternalData: boolean;
    needsComputation: boolean;
    complexity: 'simple' | 'medium' | 'complex';
  }> {
    const prompt = `Analyze the following query to determine what type of analysis is needed:
    "${query}"
    
    Consider:
    - Does it need external data gathering?
    - Does it need computational analysis?
    - What's the complexity level?
    - What type of analysis (trend, comparative, statistical, qualitative, etc.)?
    
    Respond in JSON format with: type, needsExternalData, needsComputation, complexity`;

    try {
      const response = await this.llmService.generateText(prompt, { maxTokens: 200, temperature: 0.1 });
      return JSON.parse(response);
    } catch (error) {
      return {
        type: 'general',
        needsExternalData: true,
        needsComputation: false,
        complexity: 'medium'
      };
    }
  }

  private async extractAnalysisData(content: string, query: string): Promise<any[]> {
    const prompt = `Extract structured data points relevant to the analysis query: "${query}"
    
    From this content:
    ${content.substring(0, 2000)}...
    
    Extract data points, statistics, facts, or insights that would be useful for analysis. Return as JSON array.`;

    try {
      const response = await this.llmService.generateText(prompt, { maxTokens: 300, temperature: 0.2 });
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      // Fallback: extract simple key points
      return await this.llmService.extractKeyPoints(content);
    }
  }

  private async performDataAnalysis(data: any[], query: string, analysisType: any): Promise<{
    findings: string[];
    confidence: number;
    insights: string[];
  }> {
    if (data.length === 0) {
      return { findings: [], confidence: 0.1, insights: [] };
    }

    const prompt = `Perform ${analysisType.type} analysis on the following data for the query: "${query}"
    
    Data:
    ${JSON.stringify(data.slice(0, 10), null, 2)}
    
    Provide:
    1. Key findings
    2. Patterns or trends
    3. Insights and implications
    4. Confidence level (0-1)
    
    Format as JSON with: findings (array), insights (array), confidence (number)`;

    try {
      const response = await this.llmService.generateText(prompt, { maxTokens: 500, temperature: 0.3 });
      const analysis = JSON.parse(response);
      
      return {
        findings: analysis.findings || [],
        confidence: Math.min(1, Math.max(0.1, analysis.confidence || 0.5)),
        insights: analysis.insights || []
      };
    } catch (error) {
      // Fallback analysis
      return {
        findings: [`Analysis of ${data.length} data points for: ${query}`],
        confidence: 0.6,
        insights: [`Analyzed ${data.length} data points with ${analysisType.type} approach`]
      };
    }
  }

  private async generateAnalysisCode(data: any[], query: string): Promise<string> {
    const prompt = `Generate Python code to analyze the following data for: "${query}"
    
    Data sample: ${JSON.stringify(data.slice(0, 3), null, 2)}
    
    Generate code that:
    1. Processes the data
    2. Performs relevant calculations
    3. Generates insights
    4. Returns summary results
    
    Use pandas, numpy, matplotlib if needed. Keep it concise.`;

    try {
      const code = await this.llmService.generateText(prompt, { maxTokens: 400, temperature: 0.2 });
      return code;
    } catch (error) {
      return `
# Basic analysis for: ${query}
data = ${JSON.stringify(data.slice(0, 5))}
print(f"Analyzed {len(data)} data points")
print(f"Query: ${query}")
`;
    }
  }

  private async generateAnalysisSynthesis(findings: string[], query: string, analysisType: any): Promise<string> {
    const prompt = `Create a comprehensive analysis synthesis for: "${query}"
    
    Analysis type: ${analysisType.type}
    
    Findings:
    ${findings.join('\n')}
    
    Generate a well-structured analysis report with:
    1. Executive summary
    2. Key findings
    3. Insights and implications
    4. Conclusions`;

    try {
      return await this.llmService.generateText(prompt, { maxTokens: 600, temperature: 0.4 });
    } catch (error) {
      return `Analysis Report: ${query}\n\nKey Findings:\n${findings.join('\n\n')}\n\nThis analysis was completed using ${analysisType.type} methodology.`;
    }
  }

  // Helper methods for synthesis functionality
  private async parseSynthesisRequirements(query: string): Promise<{
    approach: string;
    concepts: string[];
    needsExternalSources: boolean;
    needsInsights: boolean;
    complexity: 'simple' | 'medium' | 'complex';
  }> {
    const prompt = `Analyze this synthesis request to understand requirements:
    "${query}"
    
    Determine:
    - What synthesis approach is needed (comparative, integrative, thematic, etc.)
    - What key concepts need to be synthesized
    - Does it need external sources beyond memory?
    - Does it need additional insights generation?
    - Complexity level
    
    Respond in JSON format with: approach, concepts (array), needsExternalSources, needsInsights, complexity`;

    try {
      const response = await this.llmService.generateText(prompt, { maxTokens: 250, temperature: 0.1 });
      return JSON.parse(response);
    } catch (error) {
      return {
        approach: 'integrative',
        concepts: [query],
        needsExternalSources: true,
        needsInsights: true,
        complexity: 'medium'
      };
    }
  }

  private async calculateRelevanceScore(content: string, query: string): Promise<number> {
    try {
      const isRelevant = await this.llmService.isContentRelevant(content, query);
      return isRelevant ? 0.8 : 0.3;
    } catch (error) {
      return 0.5;
    }
  }

  private async organizeContentForSynthesis(materials: any[], requirements: any): Promise<Record<string, any[]>> {
    const organized: Record<string, any[]> = {};
    
    // Simple categorization based on source type and content
    for (const material of materials) {
      let category = 'general';
      
      if (material.source === 'memory') {
        category = 'memory_insights';
      } else if (material.url) {
        category = 'external_sources';
      }
      
      // Further categorize by concepts if multiple
      if (requirements.concepts.length > 1) {
        for (const concept of requirements.concepts) {
          if (material.content && material.content.toLowerCase().includes(concept.toLowerCase())) {
            category = `${concept}_related`;
            break;
          }
        }
      }
      
      if (!organized[category]) {
        organized[category] = [];
      }
      organized[category].push(material);
    }
    
    return organized;
  }

  private async identifyPatternsAndConnections(organizedContent: Record<string, any[]>, query: string): Promise<string[]> {
    const patterns: string[] = [];
    
    try {
      const contentSummary = Object.entries(organizedContent)
        .map(([category, items]) => `${category}: ${items.length} items`)
        .join(', ');
      
      const prompt = `Identify patterns and connections in the following organized content for: "${query}"
      
      Content organization: ${contentSummary}
      
      Sample content: ${JSON.stringify(Object.values(organizedContent).flat().slice(0, 3), null, 2)}
      
      Identify:
      1. Recurring themes
      2. Connections between sources
      3. Contradictions or gaps
      4. Emerging patterns
      
      Return as array of pattern descriptions.`;

      const response = await this.llmService.generateText(prompt, { maxTokens: 400, temperature: 0.3 });
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [response];
    } catch (error) {
      // Fallback pattern identification
      const totalItems = Object.values(organizedContent).flat().length;
      return [
        `Content spans ${Object.keys(organizedContent).length} categories`,
        `Total of ${totalItems} source materials analyzed`,
        `Primary focus: ${query}`
      ];
    }
  }

  private async createSynthesisFramework(
    organizedContent: Record<string, any[]>, 
    patterns: string[], 
    requirements: any
  ): Promise<any> {
    return {
      approach: requirements.approach,
      structure: [
        'Introduction and Context',
        'Key Themes and Patterns',
        'Synthesis of Findings',
        'Implications and Insights',
        'Conclusions'
      ],
      contentMapping: Object.keys(organizedContent),
      patternsToIntegrate: patterns.slice(0, 5)
    };
  }

  private async generateComprehensiveSynthesis(
    organizedContent: Record<string, any[]>,
    patterns: string[],
    framework: any,
    query: string,
    requirements: any
  ): Promise<string> {
    const prompt = `Generate a comprehensive synthesis for: "${query}"
    
    Approach: ${requirements.approach}
    
    Content categories: ${Object.keys(organizedContent).join(', ')}
    Total sources: ${Object.values(organizedContent).flat().length}
    
    Key patterns identified:
    ${patterns.slice(0, 5).join('\n')}
    
    Framework structure:
    ${framework.structure.join('\n')}
    
    Create a well-structured, comprehensive synthesis that:
    1. Integrates information from all sources
    2. Addresses the key patterns
    3. Provides meaningful insights
    4. Follows the specified approach
    
    Make it comprehensive but concise.`;

    try {
      return await this.llmService.generateText(prompt, { maxTokens: 800, temperature: 0.4 });
    } catch (error) {
      const totalSources = Object.values(organizedContent).flat().length;
      return `Synthesis of "${query}"\n\nThis synthesis integrates information from ${totalSources} sources across ${Object.keys(organizedContent).length} categories.\n\nKey patterns identified:\n${patterns.join('\n\n')}\n\nThe analysis follows a ${requirements.approach} approach to provide comprehensive insights on the requested topic.`;
    }
  }

  private calculateSynthesisConfidence(
    sourceMaterials: any[],
    patterns: string[],
    requirements: any
  ): number {
    let confidence = 0.3; // Base confidence
    
    // Increase confidence based on source diversity and quality
    confidence += Math.min(0.3, sourceMaterials.length * 0.05);
    
    // Increase confidence based on patterns identified
    confidence += Math.min(0.2, patterns.length * 0.04);
    
    // Adjust based on complexity
    if (requirements.complexity === 'simple') confidence += 0.1;
    else if (requirements.complexity === 'complex') confidence += 0.2;
    
    return Math.min(0.95, Math.max(0.1, confidence));
  }

  private async generateAdditionalInsights(
    organizedContent: Record<string, any[]>,
    patterns: string[],
    query: string
  ): Promise<string[]> {
    const prompt = `Generate additional insights beyond the main synthesis for: "${query}"
    
    Based on patterns: ${patterns.slice(0, 3).join(', ')}
    Content categories: ${Object.keys(organizedContent).join(', ')}
    
    Provide 3-5 additional insights that:
    1. Go beyond obvious conclusions
    2. Identify implications or applications
    3. Suggest future directions
    4. Highlight unexpected connections
    
    Return as JSON array.`;

    try {
      const response = await this.llmService.generateText(prompt, { maxTokens: 300, temperature: 0.5 });
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [response];
    } catch (error) {
      return [
        `Further research could explore connections between ${Object.keys(organizedContent).join(' and ')}`,
        `The synthesis reveals ${patterns.length} key patterns worth deeper investigation`,
        `Practical applications of these insights could benefit various stakeholders`
      ];
    }
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