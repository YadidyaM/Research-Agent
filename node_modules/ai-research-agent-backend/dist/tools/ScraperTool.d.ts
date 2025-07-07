import { Tool } from '../types';
interface ScrapedContent {
    url: string;
    title: string;
    content: string;
    metadata: {
        author?: string | undefined;
        publishedDate?: string | undefined;
        description?: string | undefined;
        [key: string]: any;
    };
    extractedAt: Date;
    contentLength: number;
    success: boolean;
    error?: string | undefined;
}
interface ScraperConfig {
    timeout?: number | undefined;
    userAgent?: string | undefined;
    maxConcurrency?: number | undefined;
    poolSize?: number | undefined;
    retryAttempts?: number | undefined;
    delay?: number | undefined;
}
export declare class ScraperTool implements Tool {
    name: string;
    description: string;
    private timeout;
    private userAgent;
    private maxConcurrency;
    private poolSize;
    private retryAttempts;
    private delay;
    private browserPool;
    private isInitialized;
    private activeRequests;
    constructor(config?: ScraperConfig);
    execute(input: {
        url: string;
        waitForSelector?: string | undefined;
        extractImages?: boolean | undefined;
        extractLinks?: boolean | undefined;
        customSelectors?: Record<string, string> | undefined;
    }): Promise<ScrapedContent>;
    private scrapeWithBrowser;
    private initializeBrowserPool;
    private getBrowserInstance;
    private releaseBrowserInstance;
    scrapeMultipleUrls(urls: string[], options?: {
        concurrency?: number | undefined;
        delay?: number | undefined;
        extractImages?: boolean | undefined;
        extractLinks?: boolean | undefined;
        customSelectors?: Record<string, string> | undefined;
    }): Promise<ScrapedContent[]>;
    validateUrl(url: string): Promise<boolean>;
    getPageTitle(url: string): Promise<string | null>;
    extractSpecificContent(url: string, selectors: Record<string, string>): Promise<Record<string, string>>;
    batchExtract(requests: Array<{
        url: string;
        selectors?: Record<string, string> | undefined;
        waitForSelector?: string | undefined;
    }>): Promise<ScrapedContent[]>;
    private createFallbackResult;
    getPoolStats(): Promise<{
        poolSize: number;
        activeRequests: number;
        availableInstances: number;
        totalRequests: number;
    }>;
    close(): Promise<void>;
    health(): Promise<boolean>;
}
export {};
//# sourceMappingURL=ScraperTool.d.ts.map