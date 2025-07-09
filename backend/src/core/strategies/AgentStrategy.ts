import { AgentStep } from '../../types';

// Base interfaces for unified agent architecture
export interface AgentConfig {
  provider: 'langchain' | 'custom' | 'simple';
  temperature: number;
  maxIterations: number;
  timeout: number;
  enableMemory: boolean;
  enableProgress: boolean;
  parallelProcessing: boolean;
  // LLM Provider Configuration
  llmProvider?: 'ollama' | 'deepseek' | 'openai' | 'huggingface';
  llmEndpoint?: string;
  llmModel?: string;
  llmApiKey?: string;
}

export interface ExecutionContext {
  query: string;
  taskType: 'research' | 'analysis' | 'synthesis' | 'chat';
  options?: Record<string, any>;
  onStep?: (step: AgentStep) => void;
  onThought?: (thought: string) => void;
  onProgress?: (progress: { current: number; total: number; message: string }) => void;
}

export interface ExecutionResult {
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
  steps: AgentStep[];
  searchResults?: Array<{
    id: string;
    title: string;
    url: string;
    description?: string;
    snippet?: string;
    domain?: string;
  }>;
  executionTime: number;
  metadata?: Record<string, any>;
}

// Strategy interface that all agent implementations must follow
export abstract class AgentStrategy {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // Main execution method - must be implemented by all strategies
  abstract execute(context: ExecutionContext): Promise<ExecutionResult>;

  // Health check method
  abstract health(): Promise<{
    status: string;
    tools: Record<string, boolean>;
    memory: boolean;
    agent: boolean;
  }>;

  // Initialize strategy resources
  abstract initialize(): Promise<void>;

  // Cleanup strategy resources
  abstract cleanup(): Promise<void>;

  // Chat method for conversational interactions
  abstract chat(message: string, onStep?: (step: AgentStep) => void): Promise<string>;

  // Memory management methods
  abstract clearMemory(): void;
  abstract getMemory(): any[];

  // Tool management
  abstract getAvailableTools(): string[];
  abstract getToolCapabilities(toolName: string): Promise<any>;

  // Configuration updates
  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }
} 