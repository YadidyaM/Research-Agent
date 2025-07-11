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
    endpoint?: string;
    apiKey?: string;
    model: string;
}
export interface VectorSearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    similarity: number;
}
export interface MemoryChunk {
    id: string;
    content: string;
    embedding: number[];
    metadata: {
        source: string;
        timestamp: Date;
        type: string;
        [key: string]: any;
    };
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
        endpoint?: string;
        collectionName: string;
    };
    tools: {
        webSearch: {
            provider: 'tavily' | 'serpapi' | 'duckduckgo';
            apiKey?: string;
            tavilyApiKey?: string;
        };
        scraper: {
            timeout: number;
            userAgent: string;
        };
        python: {
            sandboxed: boolean;
            timeout: number;
        };
    };
    embedding: {
        provider: 'huggingface' | 'openai';
        model: string;
        apiKey?: string;
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
    step: number;
    action: string;
    tool?: string;
    input?: any;
    output?: any;
    timestamp: Date;
}
export interface ResearchContext {
    query: string;
    sources: string[];
    findings: string[];
    synthesis: string;
    confidence: number;
}
//# sourceMappingURL=index.d.ts.map