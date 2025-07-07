export interface LLMGenerationOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface SourceCredibilityResult {
  score: number;
  reasoning: string;
}

export interface ILLMService {
  // Core text generation
  generateText(prompt: string, options?: LLMGenerationOptions): Promise<string>;
  createChatCompletion(messages: ChatMessage[], options?: {
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;

  // Research-specific operations
  generateResearchPlan(query: string): Promise<string>;
  isContentRelevant(content: string, query: string): Promise<boolean>;
  extractKeyPoints(content: string): Promise<string[]>;
  synthesizeFindings(findings: string[]): Promise<string>;
  
  // General purpose operations
  generateResponse(query: string): Promise<string>;
  optimizeSearchQuery(query: string): Promise<string[]>;
  evaluateSourceCredibility(url: string, title: string, content: string): Promise<SourceCredibilityResult>;

  // Configuration
  getProvider(): string;
  getModel(): string;
  updateConfig(config: Partial<any>): void;
} 