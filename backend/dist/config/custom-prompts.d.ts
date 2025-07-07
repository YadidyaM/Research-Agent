export declare const CUSTOM_PROMPTS: {
    BASIC_CHAT_PERSONALITY: string;
    RESEARCH_ASSISTANT_STYLE: string;
    CONTENT_ANALYSIS_APPROACH: string;
    SYNTHESIS_METHODOLOGY: string;
};
export declare const PROMPT_CUSTOMIZATION: {
    TONE_MODIFIERS: {
        PROFESSIONAL: string;
        CASUAL: string;
        ACADEMIC: string;
        TECHNICAL: string;
        BEGINNER_FRIENDLY: string;
    };
    LENGTH_PREFERENCES: {
        BRIEF: string;
        DETAILED: string;
        BALANCED: string;
        EXHAUSTIVE: string;
    };
    DOMAIN_EXPERTISE: {
        TECHNOLOGY: string;
        BUSINESS: string;
        SCIENCE: string;
        HEALTHCARE: string;
        LEGAL: string;
        EDUCATION: string;
    };
};
export declare const PROMPT_COMBINATIONS: {
    TECHNICAL_RESEARCHER: {
        personality: string;
        tone: string;
        length: string;
        domain: string;
    };
    BUSINESS_ANALYST: {
        personality: string;
        tone: string;
        length: string;
        domain: string;
    };
    EDUCATIONAL_HELPER: {
        personality: string;
        tone: string;
        length: string;
        domain: string;
    };
};
export declare const CUSTOMIZATION_GUIDE = "\nHOW TO CUSTOMIZE YOUR AI RESEARCH AGENT:\n\n1. BASIC CUSTOMIZATION:\n   - Edit the prompts in CUSTOM_PROMPTS to change the AI's personality and approach\n   - Modify the tone, length, and domain preferences in PROMPT_CUSTOMIZATION\n\n2. ADVANCED CUSTOMIZATION:\n   - Create new prompt combinations in PROMPT_COMBINATIONS\n   - Add your own domain expertise areas\n   - Adjust the temperature and token settings in the main prompts.ts file\n\n3. DOMAIN-SPECIFIC CUSTOMIZATION:\n   - Add specialized knowledge areas relevant to your field\n   - Include specific evaluation criteria for your domain\n   - Customize the research methodology for your use case\n\n4. TESTING YOUR CHANGES:\n   - Restart the backend server after making changes\n   - Test with various queries to ensure the AI behaves as expected\n   - Adjust prompts based on the quality of responses\n\nRemember: The key to effective prompts is being specific about what you want while leaving room for the AI to be creative and helpful.\n";
export declare const ACTIVE_PROMPT_CONFIG: {
    CURRENT_SETUP: string;
    OVERRIDES: {};
};
//# sourceMappingURL=custom-prompts.d.ts.map