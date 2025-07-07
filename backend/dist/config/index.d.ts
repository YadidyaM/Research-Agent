import { AgentConfig } from '../types';
export declare const config: {
    port: string | number;
    nodeEnv: string;
    llm: {
        provider: string;
        ollamaEndpoint: string;
        ollamaModel: string;
        openaiApiKey: string | undefined;
        openaiModel: string;
        huggingfaceApiKey: string | undefined;
    };
    vectorDb: {
        type: string;
        chromaEndpoint: string;
        collectionName: string;
    };
    tools: {
        webSearch: {
            provider: string;
            serpApiKey: string | undefined;
            tavilyApiKey: string | undefined;
        };
        scraper: {
            timeout: number;
            userAgent: string;
        };
        python: {
            sandboxed: boolean;
            timeout: number;
            endpoint: string;
        };
    };
    embedding: {
        provider: string;
        model: string;
        huggingfaceApiKey: string | undefined;
        openaiApiKey: string | undefined;
    };
    cors: {
        origin: string;
        credentials: boolean;
    };
    rateLimit: {
        windowMs: number;
        max: number;
    };
};
export declare const getAgentConfig: () => AgentConfig;
export default config;
//# sourceMappingURL=index.d.ts.map