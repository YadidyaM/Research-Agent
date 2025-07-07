import { LLMService } from '../services/llm.service';
import { WebSearchTool } from '../tools/WebSearchTool';
import { ScraperTool } from '../tools/ScraperTool';
import { PDFParserTool } from '../tools/PDFParserTool';
import { config } from '../config';

export interface SimpleAgentTask {
  type: 'research' | 'analysis' | 'synthesis';
  query: string;
  options?: Record<string, any>;
}

export interface SimpleResearchContext {
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
  steps: ResearchStep[];
}

export interface ResearchStep {
  id: string;
  step: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  description: string;
  data?: any;
  timestamp: Date;
}

export class SimpleAgentRunner {
  private llmService: LLMService;
  private webSearchTool: WebSearchTool;
  private scraperTool: ScraperTool;
  private pdfParserTool: PDFParserTool;
  private progressCallback?: (step: ResearchStep) => void;

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
      provider: config.tools.webSearch.provider as 'tavily' | 'serpapi' | 'duckduckgo',
      apiKey: config.tools.webSearch.serpApiKey,
      tavilyApiKey: config.tools.webSearch.tavilyApiKey,
    });

    this.scraperTool = new ScraperTool({
      timeout: config.tools.scraper.timeout,
      userAgent: config.tools.scraper.userAgent,
    });

    this.pdfParserTool = new PDFParserTool({
      tavilyApiKey: config.tools.webSearch.tavilyApiKey,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      timeout: 30000, // 30 seconds
    });
  }

  setProgressCallback(callback: (step: ResearchStep) => void) {
    this.progressCallback = callback;
  }

  private emitStep(step: string, status: ResearchStep['status'], description: string, data?: any) {
    const researchStep: ResearchStep = {
      id: `${step}-${Date.now()}`,
      step,
      status,
      description,
      data,
      timestamp: new Date(),
    };
    
    console.log(`[${status.toUpperCase()}] ${step}: ${description}`);
    if (this.progressCallback) {
      this.progressCallback(researchStep);
    }
    
    return researchStep;
  }

  async executeTask(task: SimpleAgentTask): Promise<SimpleResearchContext> {
    switch (task.type) {
      case 'research':
        return this.executeResearchTask(task);
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  }

  private async executeResearchTask(task: SimpleAgentTask): Promise<SimpleResearchContext> {
    const { query } = task;
    const context: SimpleResearchContext = {
      query,
      findings: [],
      sources: [],
      synthesis: '',
      confidence: 0,
      steps: [],
    };

    try {
      // Step 1: Generate research plan
      const planStep = this.emitStep('planning', 'running', 'Generating research plan using AI...');
      context.steps.push(planStep);
      
      const plan = await this.llmService.generateResearchPlan(query);
      
      planStep.status = 'completed';
      planStep.data = { plan };
      this.emitStep('planning', 'completed', 'Research plan generated successfully', { plan });

      // Step 2: Search for relevant sources
      const searchStep = this.emitStep('searching', 'running', 'Searching the web for relevant sources...');
      context.steps.push(searchStep);
      
      const searchResults = await this.webSearchTool.execute({ 
        query,
        maxResults: 10,
        searchDepth: 'basic', // Use basic for faster results
        includeRawContent: false // Don't fetch full content yet
      });
      
      // Separate PDF URLs from other non-scrapable URLs
      const pdfResults = searchResults.filter(result => {
        const url = result.url.toLowerCase();
        return url.includes('.pdf') || url.includes('application/pdf');
      });

      const scrapableResults = searchResults.filter(result => {
        const url = result.url.toLowerCase();
        const nonScrapableExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3'];
        return !nonScrapableExtensions.some(ext => url.includes(ext)) && !url.includes('.pdf');
      });
      
      context.sources = [...scrapableResults.map(result => result.url), ...pdfResults.map(result => result.url)];
      
      searchStep.status = 'completed';
      searchStep.data = { 
        results: scrapableResults, 
        pdfResults: pdfResults,
        count: scrapableResults.length,
        pdfCount: pdfResults.length,
        filtered: searchResults.length - scrapableResults.length - pdfResults.length
      };
      this.emitStep('searching', 'completed', `Found ${scrapableResults.length} web sources and ${pdfResults.length} PDF sources (filtered ${searchResults.length - scrapableResults.length - pdfResults.length} non-scrapable)`, { 
        results: scrapableResults.map(r => ({ title: r.title, url: r.url })),
        pdfResults: pdfResults.map(r => ({ title: r.title, url: r.url })),
        count: scrapableResults.length,
        pdfCount: pdfResults.length
      });

      // Step 3: Extract content from sources (PARALLEL PROCESSING)
      const maxSources = Math.min(5, scrapableResults.length); // Limit to 5 sources max
      const maxPDFs = Math.min(2, pdfResults.length); // Limit to 2 PDFs max
      const totalSources = maxSources + maxPDFs;
      
      const scrapingStep = this.emitStep('scraping', 'running', `Analyzing content from ${totalSources} sources (${maxSources} web pages, ${maxPDFs} PDFs) in parallel...`);
      context.steps.push(scrapingStep);
      
      const scrapingPromises = scrapableResults.slice(0, maxSources).map(async (result, index) => {
        try {
          this.emitStep('scraping', 'running', `Extracting content from: ${result.title}`);
          
          // Add timeout for individual scraping operations
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Scraping timeout')), 15000); // 15 second timeout
          });
          
          const scrapingPromise = this.scraperTool.execute({ url: result.url });
          const content = await Promise.race([scrapingPromise, timeoutPromise]) as any;
          
          // Quick relevance check using snippet first (faster than full content)
          const snippet = result.snippet || content.content.substring(0, 500);
          const isRelevant = await this.llmService.isContentRelevant(snippet, query);
          
          return {
            url: result.url,
            title: result.title,
            success: true,
            relevant: isRelevant,
            content: isRelevant ? content.content : null,
            contentLength: content.content.length,
            index
          };
          
        } catch (error) {
          console.error(`Failed to process ${result.url}:`, error);
          return {
            url: result.url,
            title: result.title,
            success: false,
            relevant: false,
            content: null,
            error: error instanceof Error ? error.message : 'Unknown error',
            index
          };
        }
      });

      // PDF processing promises
      const pdfPromises = pdfResults.slice(0, maxPDFs).map(async (result, index) => {
        try {
          this.emitStep('scraping', 'running', `Extracting PDF content from: ${result.title}`);
          
          // Add timeout for PDF processing
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('PDF processing timeout')), 30000); // 30 second timeout
          });
          
          const pdfPromise = this.pdfParserTool.execute({ 
            source: result.url,
            useTavilyExtract: true,
            maxPages: 10 // Limit to first 10 pages for performance
          });
          const pdfContent = await Promise.race([pdfPromise, timeoutPromise]) as any;
          
          // Quick relevance check using first part of PDF content
          const snippet = result.snippet || pdfContent.text.substring(0, 500);
          const isRelevant = await this.llmService.isContentRelevant(snippet, query);
          
          return {
            url: result.url,
            title: result.title,
            success: pdfContent.success,
            relevant: isRelevant,
            content: isRelevant ? pdfContent.text : null,
            contentLength: pdfContent.text.length,
            pages: pdfContent.pages,
            index,
            type: 'pdf'
          };
          
        } catch (error) {
          console.error(`Failed to process PDF ${result.url}:`, error);
          return {
            url: result.url,
            title: result.title,
            success: false,
            relevant: false,
            content: null,
            error: error instanceof Error ? error.message : 'Unknown error',
            index,
            type: 'pdf'
          };
        }
      });

      // Combine all processing promises
      const allPromises = [...scrapingPromises, ...pdfPromises];
      
      // Wait for all processing to complete with overall timeout
      const overallTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Overall processing timeout')), 60000); // 60 second overall timeout
      });
      
      let processingResults;
      try {
        processingResults = await Promise.race([
          Promise.allSettled(allPromises),
          overallTimeout
        ]) as PromiseSettledResult<any>[];
      } catch (error) {
        // If overall timeout, get partial results
        processingResults = await Promise.allSettled(allPromises);
      }
      
      // Process successful results
      const successfulResults = processingResults
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(result => result.success && result.relevant);
      
      // Extract key points from relevant content in parallel
      if (successfulResults.length > 0) {
        const keyPointPromises = successfulResults.map(async (result) => {
          try {
            if (result.content) {
              // Limit content size for faster processing
              const truncatedContent = result.content.substring(0, 3000);
              return await this.llmService.extractKeyPoints(truncatedContent);
            }
            return [];
          } catch (error) {
            console.error(`Failed to extract key points from ${result.url}:`, error);
            return [];
          }
        });
        
        const keyPointResults = await Promise.allSettled(keyPointPromises);
        keyPointResults.forEach(result => {
          if (result.status === 'fulfilled') {
            context.findings.push(...result.value);
          }
        });
      }
      
      const allResults = processingResults.map(result => 
        result.status === 'fulfilled' ? result.value : { 
          success: false, 
          error: 'Promise rejected',
          url: 'unknown',
          title: 'unknown'
        }
      );
      
      scrapingStep.status = 'completed';
      scrapingStep.data = { 
        results: allResults, 
        successful: successfulResults.length,
        relevant: successfulResults.length
      };
      this.emitStep('scraping', 'completed', `Successfully analyzed ${successfulResults.length} relevant sources`, {
        results: allResults,
        successful: successfulResults.length
      });

      // Step 4: Synthesize findings
      const synthesisStep = this.emitStep('synthesis', 'running', 'Synthesizing research findings...');
      context.steps.push(synthesisStep);
      
      if (context.findings.length > 0) {
        // Limit findings for faster synthesis
        const limitedFindings = context.findings.slice(0, 20); // Max 20 findings
        context.synthesis = await this.llmService.synthesizeFindings(limitedFindings);
        context.confidence = Math.min(0.9, 0.3 + (successfulResults.length * 0.15)); // Dynamic confidence
        
        synthesisStep.status = 'completed';
        synthesisStep.data = { 
          findingsCount: context.findings.length, 
          confidence: context.confidence,
          synthesis: context.synthesis 
        };
        this.emitStep('synthesis', 'completed', `Research completed with ${context.findings.length} key findings`, {
          findingsCount: context.findings.length,
          confidence: context.confidence
        });
      } else {
        // Fallback: use search result snippets if no content was scraped
        if (scrapableResults.length > 0) {
          const snippets = scrapableResults.slice(0, 3).map(r => r.snippet).filter(Boolean);
          if (snippets.length > 0) {
            context.synthesis = await this.llmService.synthesizeFindings(snippets);
            context.confidence = 0.4; // Lower confidence for snippet-only synthesis
          } else {
            context.synthesis = 'No significant findings were discovered from the available sources.';
            context.confidence = 0.1;
          }
        } else {
          context.synthesis = 'No scrapable sources were found for this query.';
          context.confidence = 0.1;
        }
        
        synthesisStep.status = 'completed';
        synthesisStep.data = { findingsCount: context.findings.length, confidence: context.confidence };
        this.emitStep('synthesis', 'completed', 'Research completed with limited findings', {
          findingsCount: context.findings.length,
          confidence: context.confidence
        });
      }

      return context;
    } catch (error) {
      this.emitStep('error', 'error', `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Research task failed:', error);
      throw error;
    }
  }
} 