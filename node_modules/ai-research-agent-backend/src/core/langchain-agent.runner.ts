import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { DynamicTool, Tool } from '@langchain/core/tools';
import { v4 as uuidv4 } from 'uuid';

// Import existing tools
import { WebSearchTool } from '../tools/WebSearchTool';
import { ScraperTool } from '../tools/ScraperTool';
import { MemoryTool } from '../tools/MemoryTool';
import { PythonExecutorTool } from '../tools/PythonExecutorTool';
import { PDFParserTool } from '../tools/PDFParserTool';

// Import services
import { ServiceFactory } from '../services/ServiceFactory';

// Import types
import { AgentStep } from '../types';
import { config } from '../config';
import { RESEARCH_AGENT_SYSTEM_PROMPT } from '../config/prompts';

// Research Context Interface
export interface ResearchContext {
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
  steps: AgentStep[];
  searchResults?: Array<{
    id: string;
    title: string;
    url: string;
    description?: string;
    snippet?: string;
    domain?: string;
  }>;
}

// LangChain Research Agent
export class LangChainAgentRunner {
  private llm: ChatOpenAI;
  private tools: Tool[] = [];
  private agent?: AgentExecutor;
  private memory: BaseMessage[] = [];
  
  // Tool instances
  private webSearchTool: WebSearchTool;
  private scraperTool: ScraperTool;
  private memoryTool: MemoryTool | null = null;
  private pythonTool: PythonExecutorTool;
  private pdfTool: PDFParserTool;
  
  // Service factory for dependency management
  private serviceFactory: ServiceFactory;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize service factory
    this.serviceFactory = ServiceFactory.getInstance();
    
    // Initialize LLM based on configuration
    const llmConfig: any = {
      modelName: config.llm.provider === 'deepseek' ? config.llm.deepseekModel : config.llm.openaiModel,
      temperature: 0.1,
      openAIApiKey: config.llm.provider === 'deepseek' ? config.llm.deepseekApiKey : config.llm.openaiApiKey,
    };

    // Add configuration for DeepSeek
    if (config.llm.provider === 'deepseek') {
      llmConfig.configuration = {
        baseURL: config.llm.deepseekBaseUrl,
      };
    }

    this.llm = new ChatOpenAI(llmConfig);

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
      timeout: 30000,
      sandboxed: true,
      endpoint: config.tools.python.endpoint,
    });

    this.pdfTool = new PDFParserTool({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      timeout: 30000,
    });

    // Initialize MemoryTool asynchronously in the init method
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    try {
      // Initialize service factory if not already done
      if (!this.serviceFactory.isServiceInitialized()) {
        console.log('🔧 Initializing service factory for LangChain agent...');
        await this.serviceFactory.initialize();
      }

      // Initialize MemoryTool with proper dependencies
      console.log('🧠 Initializing MemoryTool with vector and embedding services...');
      this.memoryTool = await this.serviceFactory.createMemoryTool();

      // Recreate tools with memory tool now available
      this.tools = this.createLangChainTools();
      
      this.isInitialized = true;
      console.log('✅ LangChain agent runner initialization complete');

    } catch (error) {
      console.error('❌ Failed to initialize MemoryTool:', error);
      console.warn('⚠️  LangChain agent will run without memory capabilities');
      this.memoryTool = null;
      this.tools = this.createLangChainTools();
      this.isInitialized = true;
    }
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
            if (!this.memoryTool) {
              return 'Memory tool not initialized';
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
            if (!this.memoryTool) {
              return 'Memory tool not initialized';
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
    ];
  }

  private async initializeAgent(): Promise<void> {
    if (this.agent) return;

    // Ensure async initialization is complete
    if (!this.isInitialized) {
      console.log('⏳ Waiting for async initialization to complete...');
      let attempts = 0;
      while (!this.isInitialized && attempts < 30) { // Wait up to 15 seconds
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (!this.isInitialized) {
        console.warn('⚠️  Async initialization did not complete, proceeding without full initialization');
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
      maxIterations: 10,
      earlyStoppingMethod: 'generate',
    });
  }

  async executeResearch(
    query: string,
    onStep?: (step: AgentStep) => void,
    onThought?: (thought: string) => void
  ): Promise<ResearchContext> {
    await this.initializeAgent();

    const steps: AgentStep[] = [];
    const addStep = (step: AgentStep) => {
      steps.push(step);
      onStep?.(step);
    };

    try {
      // Initial step
      addStep({
        id: uuidv4(),
        step: 'research_start',
        status: 'running',
        description: 'Starting research process',
        data: { query },
        timestamp: new Date()
      });

      onThought?.('🔍 Starting research...');

      // Execute the research
      const result = await this.agent!.invoke({
        input: `Conduct comprehensive research on: ${query}`,
        chat_history: this.memory,
      });

      onThought?.('📊 Analyzing results...');

      // Parse and structure the result
      const context = await this.parseResearchResult(result.output, query, steps);
      
      // Store the conversation in memory
      this.memory.push(new HumanMessage(query));
      this.memory.push(new AIMessage(result.output));

      // Keep memory manageable (last 10 messages)
      if (this.memory.length > 10) {
        this.memory = this.memory.slice(-10);
      }

      addStep({
        id: uuidv4(),
        step: 'research_complete',
        status: 'completed',
        description: 'Research completed successfully',
        data: { 
          findingsCount: context.findings.length,
          sourcesCount: context.sources.length,
          confidence: context.confidence
        },
        timestamp: new Date()
      });

      onThought?.('✅ Research complete!');

      return context;

    } catch (error) {
      console.error('Research execution failed:', error);
      
      addStep({
        id: uuidv4(),
        step: 'research_error',
        status: 'error',
        description: 'Research failed',
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date()
      });

      onThought?.('❌ Research failed');

      throw error;
    }
  }

  private async parseResearchResult(
    output: string, 
    query: string, 
    steps: AgentStep[]
  ): Promise<ResearchContext> {
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
      searchResults
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

  async chat(
    message: string,
    onStep?: (step: AgentStep) => void
  ): Promise<string> {
    await this.initializeAgent();

    try {
      const result = await this.agent!.invoke({
        input: message,
        chat_history: this.memory,
      });

      // Store conversation in memory
      this.memory.push(new HumanMessage(message));
      this.memory.push(new AIMessage(result.output));

      // Keep memory manageable
      if (this.memory.length > 10) {
        this.memory = this.memory.slice(-10);
      }

      return result.output;

    } catch (error) {
      console.error('Chat execution failed:', error);
      throw error;
    }
  }

  // Health check
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

  // Clear memory
  clearMemory(): void {
    this.memory = [];
  }

  // Get memory
  getMemory(): BaseMessage[] {
    return [...this.memory];
  }
} 