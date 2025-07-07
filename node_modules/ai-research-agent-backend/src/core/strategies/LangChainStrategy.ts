import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { DynamicTool, Tool } from '@langchain/core/tools';
import { v4 as uuidv4 } from 'uuid';

import { AgentStrategy, AgentConfig, ExecutionContext, ExecutionResult } from './AgentStrategy';
import { AgentStep } from '../../types';
import { config } from '../../config';
import { RESEARCH_AGENT_SYSTEM_PROMPT } from '../../config/prompts';

// Tool imports
import { WebSearchTool } from '../../tools/WebSearchTool';
import { ScraperTool } from '../../tools/ScraperTool';
import { MemoryTool } from '../../tools/MemoryTool';
import { PythonExecutorTool } from '../../tools/PythonExecutorTool';
import { PDFParserTool } from '../../tools/PDFParserTool';
import { WikipediaTool } from '../../tools/WikipediaTool';
import { ServiceFactory } from '../../services/ServiceFactory';

export class LangChainStrategy extends AgentStrategy {
  private llm: ChatOpenAI;
  private tools!: Tool[];
  private agent?: AgentExecutor;
  private memory: BaseMessage[] = [];
  
  // Tool instances
  private webSearchTool!: WebSearchTool;
  private scraperTool!: ScraperTool;
  private memoryTool: MemoryTool | null = null;
  private pythonTool!: PythonExecutorTool;
  private pdfTool!: PDFParserTool;
  private wikipediaTool!: WikipediaTool;

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);
    
    // Initialize LLM based on configuration
    const llmConfig: any = {
      modelName: config.llm.provider === 'deepseek' ? config.llm.deepseekModel : config.llm.openaiModel,
      temperature: agentConfig.temperature,
      openAIApiKey: config.llm.provider === 'deepseek' ? config.llm.deepseekApiKey : config.llm.openaiApiKey,
    };

    // Add configuration for DeepSeek
    if (config.llm.provider === 'deepseek') {
      llmConfig.configuration = {
        baseURL: config.llm.deepseekBaseUrl,
      };
    }

    this.llm = new ChatOpenAI(llmConfig);
    this.initializeTools();
  }

  private initializeTools(): void {
    // Initialize tools
    this.webSearchTool = new WebSearchTool({
      provider: config.tools.webSearch.provider as 'tavily' | 'serpapi' | 'duckduckgo',
      ...(config.tools.webSearch.serpApiKey && { apiKey: config.tools.webSearch.serpApiKey }),
      ...(config.tools.webSearch.tavilyApiKey && { tavilyApiKey: config.tools.webSearch.tavilyApiKey }),
    });

    this.scraperTool = new ScraperTool({
      timeout: config.tools.scraper.timeout,
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

    this.wikipediaTool = new WikipediaTool({
      language: config.tools.wikipedia.language,
      timeout: config.tools.wikipedia.timeout,
      userAgent: config.tools.wikipedia.userAgent,
    });

    // Convert tools to LangChain format (MemoryTool will be initialized lazily)
    this.tools = this.createLangChainTools();
  }

  private createLangChainTools(): Tool[] {
    return [
      new DynamicTool({
        name: 'web_search',
        description: 'Search the web for information. Input should be a search query string.',
        func: async (input: string) => {
          try {
            const results = await this.webSearchTool.execute({ query: input });
            return JSON.stringify(results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              domain: this.extractDomain(r.url)
            })));
          } catch (error) {
            return `Error searching web: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'scrape_website',
        description: 'Scrape content from a website URL. Input should be a valid URL.',
        func: async (input: string) => {
          try {
            const result = await this.scraperTool.execute({ url: input });
            return `Title: ${result.title}\nContent: ${result.content.substring(0, 2000)}...`;
          } catch (error) {
            return `Error scraping website: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'search_memory',
        description: 'Search previous research and findings stored in memory. Input should be a search query.',
        func: async (input: string) => {
          try {
            if (!this.memoryTool || !this.config.enableMemory) {
              return 'Memory tool not available';
            }
            const results = await this.memoryTool.execute({ 
              action: 'search', 
              query: input 
            });
            return JSON.stringify(results);
          } catch (error) {
            return `Error searching memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'store_finding',
        description: 'Store important research findings in memory. Input should be the finding text.',
        func: async (input: string) => {
          try {
            if (!this.memoryTool || !this.config.enableMemory) {
              return 'Memory tool not available';
            }
            await this.memoryTool.execute({ 
              action: 'store', 
              content: input,
              metadata: { type: 'research_finding', timestamp: new Date().toISOString() }
            });
            return 'Finding stored successfully in memory.';
          } catch (error) {
            return `Error storing finding: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'analyze_data',
        description: 'Execute Python code to analyze data, create visualizations, or perform calculations. Input should be Python code.',
        func: async (input: string) => {
          try {
            const result = await this.pythonTool.execute({ code: input });
            return `Output: ${result.output}\nError: ${result.error || 'None'}`;
          } catch (error) {
            return `Error executing Python: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'parse_pdf',
        description: 'Parse and extract text from a PDF file. Input should be a PDF file path or URL.',
        func: async (input: string) => {
          try {
            const result = await this.pdfTool.execute({ source: input });
            return `PDF Content: ${result.text.substring(0, 2000)}...\nPages: ${result.pages}`;
          } catch (error) {
            return `Error parsing PDF: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'search_wikipedia',
        description: 'Search Wikipedia for encyclopedic information. Input should be a search query or concept name.',
        func: async (input: string) => {
          try {
            const result = await this.wikipediaTool.execute({ action: 'search', query: input, maxResults: 5 });
            return JSON.stringify(result.map((r: any) => ({
              title: r.title,
              description: r.description,
              excerpt: r.excerpt.substring(0, 200) + '...'
            })));
          } catch (error) {
            return `Error searching Wikipedia: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'get_wikipedia_summary',
        description: 'Get detailed summary of a specific Wikipedia article. Input should be the exact article title.',
        func: async (input: string) => {
          try {
            const result = await this.wikipediaTool.execute({ action: 'summary', title: input });
            return `Title: ${result.title}\nDescription: ${result.description}\nExtract: ${result.extract.substring(0, 1000)}...\nURL: ${result.content_urls.desktop.page}`;
          } catch (error) {
            return `Error getting Wikipedia summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicTool({
        name: 'get_wikipedia_concept',
        description: 'Search for a concept on Wikipedia and get comprehensive information including related articles. Input should be a concept or topic name.',
        func: async (input: string) => {
          try {
            const result = await this.wikipediaTool.searchForConcept(input);
            return `Main Article: ${result.summary.title}\nDescription: ${result.summary.description}\nExtract: ${result.summary.extract.substring(0, 800)}...\nRelated Articles: ${result.relatedArticles.map(a => a.title).join(', ')}`;
          } catch (error) {
            return `Error getting Wikipedia concept: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),
    ];
  }

  async initialize(): Promise<void> {
    if (this.agent) return;

    // Initialize memory tool if enabled and not already initialized
    if (this.config.enableMemory && this.memoryTool === null) {
      try {
        console.log('🧠 Initializing memory tool for LangChain strategy...');
        const serviceFactory = ServiceFactory.getInstance();
        await serviceFactory.initialize();
        this.memoryTool = serviceFactory.getMemoryTool();
        
        // Recreate tools with memory tool now available
        this.tools = this.createLangChainTools();
        console.log('✅ Memory tool initialized successfully');
      } catch (error) {
        console.warn('⚠️ Memory tool initialization failed, continuing without memory:', error);
        this.memoryTool = null;
      }
    }

    // Create the research agent prompt
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', RESEARCH_AGENT_SYSTEM_PROMPT],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // Create the agent
    const agent = await createOpenAIFunctionsAgent({
      llm: this.llm,
      tools: this.tools,
      prompt,
    });

    // Create the agent executor
    this.agent = new AgentExecutor({
      agent,
      tools: this.tools,
      verbose: false,
      maxIterations: this.config.maxIterations,
      earlyStoppingMethod: 'generate',
    });
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    await this.initialize();

    const steps: AgentStep[] = [];
    const addStep = (step: AgentStep) => {
      steps.push(step);
      context.onStep?.(step);
    };

    try {
      // Initial step
      addStep({
        id: uuidv4(),
        step: 'research_start',
        status: 'running',
        description: 'Starting LangChain agent execution',
        data: { query: context.query, taskType: context.taskType },
        timestamp: new Date()
      });

      context.onThought?.('🔍 Starting research...');

      // Execute the research
      const result = await this.agent!.invoke({
        input: `Conduct comprehensive ${context.taskType} on: ${context.query}`,
        chat_history: this.memory,
      });

      context.onThought?.('📊 Analyzing results...');

      // Parse and structure the result
      const executionResult = await this.parseResult(result.output, context.query, steps);
      
      if (this.config.enableMemory) {
        // Store the conversation in memory
        this.memory.push(new HumanMessage(context.query));
        this.memory.push(new AIMessage(result.output));

        // Keep memory manageable
        if (this.memory.length > 10) {
          this.memory = this.memory.slice(-10);
        }
      }

      addStep({
        id: uuidv4(),
        step: 'execution_complete',
        status: 'completed',
        description: 'LangChain agent execution completed successfully',
        data: { 
          findingsCount: executionResult.findings.length,
          sourcesCount: executionResult.sources.length,
          confidence: executionResult.confidence
        },
        timestamp: new Date()
      });

      context.onThought?.('✅ Execution complete!');

      executionResult.executionTime = Date.now() - startTime;
      executionResult.steps = steps;

      return executionResult;

    } catch (error) {
      console.error('LangChain execution failed:', error);
      
      addStep({
        id: uuidv4(),
        step: 'execution_error',
        status: 'error',
        description: 'LangChain agent execution failed',
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date()
      });

      context.onThought?.('❌ Execution failed');

      throw error;
    }
  }

  private async parseResult(output: string, query: string, steps: AgentStep[]): Promise<ExecutionResult> {
    // Extract findings from the output
    const findings = this.extractFindings(output);
    
    // Extract sources from the output
    const sources = this.extractSources(output);
    
    // Create search results for UI
    const searchResults = sources.map((source, index) => ({
      id: `result-${index}`,
      title: `${this.extractDomain(source)} - Research Source`,
      url: source,
      description: `Source found during research about ${query}`,
      snippet: `This source contains relevant information for your research query.`,
      domain: this.extractDomain(source)
    }));

    // Calculate confidence based on number of sources and findings
    const confidence = Math.min(0.9, Math.max(0.1, 
      (findings.length * 0.1) + (sources.length * 0.15)
    ));

    return {
      query,
      findings,
      sources,
      synthesis: output,
      confidence,
      steps,
      searchResults,
      executionTime: 0, // Will be set in execute method
      metadata: {
        strategy: 'langchain',
        toolsUsed: this.tools.map(t => t.name)
      }
    };
  }

  private extractFindings(text: string): string[] {
    const findings: string[] = [];
    
    // Look for bullet points, numbered lists, or key findings
    const patterns = [
      /(?:^|\n)[-*•]\s+(.+)/gm,
      /(?:^|\n)\d+\.\s+(.+)/gm,
      /(?:Key finding|Finding|Important):\s*(.+)/gmi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        findings.push(...matches.map(match => match.trim()).filter(f => f.length > 20));
      }
    }

    // Remove duplicates and limit to top 10
    return [...new Set(findings)].slice(0, 10);
  }

  private extractSources(text: string): string[] {
    const urlPattern = /https?:\/\/[^\s\)]+/g;
    const matches = text.match(urlPattern) || [];
    return [...new Set(matches)].slice(0, 10);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  async chat(message: string, onStep?: (step: AgentStep) => void): Promise<string> {
    await this.initialize();

    try {
      const result = await this.agent!.invoke({
        input: message,
        chat_history: this.memory,
      });

      if (this.config.enableMemory) {
        // Store conversation in memory
        this.memory.push(new HumanMessage(message));
        this.memory.push(new AIMessage(result.output));

        // Keep memory manageable
        if (this.memory.length > 10) {
          this.memory = this.memory.slice(-10);
        }
      }

      return result.output;

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
    const toolsStatus: Record<string, boolean> = {};
    
    for (const tool of this.tools) {
      try {
        // Simple health check - just verify the tool exists
        toolsStatus[tool.name] = true;
      } catch {
        toolsStatus[tool.name] = false;
      }
    }

    return {
      status: 'healthy',
      tools: toolsStatus,
      memory: this.memory.length >= 0,
      agent: this.agent !== undefined,
    };
  }

  async cleanup(): Promise<void> {
    this.memory = [];
    this.agent = undefined;
    this.memoryTool = null;
  }

  clearMemory(): void {
    this.memory = [];
  }

  getMemory(): BaseMessage[] {
    return [...this.memory];
  }

  getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  async getToolCapabilities(toolName: string): Promise<any> {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    return {
      name: tool.name,
      description: tool.description,
      strategy: 'langchain'
    };
  }
} 