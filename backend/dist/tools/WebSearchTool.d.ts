import { Tool } from '../types';
interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    score?: number | undefined;
    publishedDate?: string | undefined;
    favicon?: string | undefined;
    rawContent?: string | undefined;
}
interface WebSearchConfig {
    provider: 'tavily' | 'serpapi' | 'duckduckgo';
    apiKey?: string;
    tavilyApiKey?: string;
    timeout?: number;
    maxRetries?: number;
}
export declare class WebSearchTool implements Tool {
    name: string;
    description: string;
    private config;
    private requestCount;
    private lastRequestTime;
    private tavilyClient;
    constructor(config: WebSearchConfig);
    execute(input: {
        query: string;
        maxResults?: number;
        searchDepth?: 'basic' | 'advanced';
        topic?: 'general' | 'news';
        includeDomains?: string[];
        excludeDomains?: string[];
        timeRange?: 'day' | 'week' | 'month' | 'year';
        includeAnswer?: boolean;
        includeRawContent?: boolean;
    }): Promise<WebSearchResult[]>;
    private searchWithTavily;
    private searchWithDuckDuckGo;
    private searchWithSerpApi;
    private createFallbackResults;
    private enforceRateLimit;
    validateQuery(query: string): Promise<boolean>;
    suggestSearchTerms(query: string): Promise<string[]>;
    searchMultipleQueries(queries: string[], maxResultsPerQuery?: number): Promise<{
        query: string;
        results: WebSearchResult[];
    }[]>;
    findAcademicSources(query: string, maxResults?: number): Promise<WebSearchResult[]>;
    findNewsSources(query: string, maxResults?: number): Promise<WebSearchResult[]>;
    findGovernmentSources(query: string, maxResults?: number): Promise<WebSearchResult[]>;
    extractContent(url: string): Promise<any>;
    crawlWebsite(url: string, options?: {
        instructions?: string;
        maxDepth?: number;
        maxBreadth?: number;
        limit?: number;
    }): Promise<any>;
    getSearchMetrics(): {
        provider: string;
        supportsBatchSearch: boolean;
        supportsRegionalSearch: boolean;
        requiresApiKey: boolean;
        requestCount: number;
        supportsAdvancedSearch: boolean;
        supportsContentExtraction: boolean;
        supportsCrawling: boolean;
    };
}
export {};
//# sourceMappingURL=WebSearchTool.d.ts.map