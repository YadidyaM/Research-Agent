export declare const SYSTEM_PROMPTS: {
    BASIC_CHAT: string;
    RESEARCH_PLANNER: string;
    RELEVANCE_EVALUATOR: string;
    KEY_POINTS_EXTRACTOR: string;
    RESEARCH_SYNTHESIZER: string;
    SEARCH_OPTIMIZER: string;
    CREDIBILITY_EVALUATOR: string;
};
export declare const PROMPT_TEMPLATES: {
    BASIC_CHAT: (query: string) => string;
    RESEARCH_PLAN: (query: string) => string;
    RELEVANCE_CHECK: (query: string, content: string) => string;
    EXTRACT_POINTS: (content: string) => string;
    SYNTHESIZE: (findings: string[]) => string;
    OPTIMIZE_SEARCH: (query: string) => string;
    EVALUATE_SOURCE: (url: string, title: string, content: string) => string;
};
export declare const PROMPT_CONFIG: {
    TEMPERATURE: {
        CREATIVE: number;
        BALANCED: number;
        ANALYTICAL: number;
        PRECISE: number;
    };
    MAX_TOKENS: {
        SHORT: number;
        MEDIUM: number;
        LONG: number;
        SYNTHESIS: number;
    };
    DEFAULTS: {
        BASIC_CHAT: {
            temperature: number;
            maxTokens: number;
        };
        RESEARCH_PLAN: {
            temperature: number;
            maxTokens: number;
        };
        RELEVANCE_CHECK: {
            temperature: number;
            maxTokens: number;
        };
        EXTRACT_POINTS: {
            temperature: number;
            maxTokens: number;
        };
        SYNTHESIZE: {
            temperature: number;
            maxTokens: number;
        };
    };
};
//# sourceMappingURL=prompts.d.ts.map