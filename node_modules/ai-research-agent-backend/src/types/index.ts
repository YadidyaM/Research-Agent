export interface Tool {
  name: string;
  description: string;
  execute(input: any): Promise<any>;
}

export interface AgentTask {
  id: string;
  type: 'research' | 'analysis' | 'synthesis';
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LLMProvider {
  name: string;
  endpoint?: string | undefined;
  apiKey?: string | undefined;
  model: string;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  source?: string;
  type?: string;
  timestamp?: string;
  relevanceScore: number;
  distance?: number;
  metadata?: Record<string, any>;
}

export interface MemoryChunk {
  id?: string;
  content: string;
  embedding?: number[];
  source?: string;
  type?: string;
  timestamp?: string;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  metadata: {
    author?: string;
    publishedDate?: string;
    description?: string;
    [key: string]: any;
  };
}

export interface PythonExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime: number;
}

export interface AgentConfig {
  llmProvider: LLMProvider;
  vectorDb: {
    type: 'chroma' | 'faiss';
    endpoint?: string | undefined;
    collectionName: string;
    dimension?: number;
    metric?: 'l2' | 'inner_product' | 'cosine';
    dataPath?: string;
    timeout?: number;
  };
  tools: {
    webSearch: {
      provider: 'tavily' | 'serpapi' | 'duckduckgo';
      apiKey?: string | undefined;
      tavilyApiKey?: string | undefined;
    };
    scraper: {
      timeout: number;
      userAgent: string;
    };
    python: {
      sandboxed: boolean;
      timeout: number;
    };
    wikipedia: {
      language: string;
      timeout: number;
      userAgent: string;
    };
  };
  embedding: {
    provider: 'huggingface' | 'openai';
    model: string;
    apiKey?: string | undefined;
  };
}

export interface AgentResponse {
  taskId: string;
  status: 'success' | 'error' | 'running';
  data?: any;
  error?: string;
  steps?: AgentStep[];
}

export interface AgentStep {
  id: string;
  step: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  description: string;
  data?: any;
  timestamp: Date;
}

export interface ResearchContext {
  query: string;
  sources: string[];
  findings: string[];
  synthesis: string;
  confidence: number;
} 