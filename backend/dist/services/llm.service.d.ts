interface LLMConfig {
    provider: string;
    endpoint?: string;
    apiKey?: string;
    model: string;
}
export declare class LLMService {
    private config;
    private hfClient?;
    constructor(config: LLMConfig);
    generateText(prompt: string, options?: {
        system?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    private generateWithOllama;
    private generateWithOpenAI;
    private generateWithHuggingFace;
    createChatCompletion(messages: Array<{
        role: string;
        content: string;
    }>, options?: {
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    generateResearchPlan(query: string): Promise<string>;
    isContentRelevant(content: string, query: string): Promise<boolean>;
    extractKeyPoints(content: string): Promise<string[]>;
    synthesizeFindings(findings: string[]): Promise<string>;
    basicChat(query: string): Promise<string>;
    optimizeSearchQuery(query: string): Promise<string[]>;
    evaluateSourceCredibility(url: string, title: string, content: string): Promise<{
        score: number;
        reasoning: string;
    }>;
}
export {};
//# sourceMappingURL=llm.service.d.ts.map