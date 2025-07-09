export interface LLMGenerationOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp?: Date;
  id?: string;
}

export interface SourceCredibilityResult {
  score: number;
  reasoning: string;
}

// New streaming interfaces
export interface StreamingOptions {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export interface StreamChunk {
  id: string;
  content: string;
  done: boolean;
  timestamp: Date;
  role?: string;
}

export interface ILLMService {
  // Core text generation
  generateText(prompt: string, options?: LLMGenerationOptions): Promise<string>;
  createChatCompletion(messages: ChatMessage[], options?: {
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;

  // NEW: Streaming methods
  generateTextStream(prompt: string, options?: LLMGenerationOptions & StreamingOptions): AsyncGenerator<StreamChunk, void, unknown>;
  createChatCompletionStream(messages: ChatMessage[], options?: {
    maxTokens?: number;
    temperature?: number;
  } & StreamingOptions): AsyncGenerator<StreamChunk, void, unknown>;

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