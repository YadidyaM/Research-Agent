import { AgentStrategy, AgentConfig, ExecutionContext, ExecutionResult } from './strategies/AgentStrategy';
import { LangChainStrategy } from './strategies/LangChainStrategy';
import { CustomStrategy } from './strategies/CustomStrategy';
import { AgentStep } from '../types';
import { config } from '../config';

export interface UnifiedAgentConfig extends AgentConfig {
  // Additional unified agent specific config
  autoFallback?: boolean;
  retryAttempts?: number;
  healthCheckInterval?: number;
}

export class UnifiedAgent {
  private strategy: AgentStrategy;
  private config: UnifiedAgentConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date = new Date();

  constructor(config: UnifiedAgentConfig) {
    this.config = {
      // Default configuration
      provider: 'langchain',
      temperature: 0.1,
      maxIterations: 10,
      timeout: 30000,
      enableMemory: true,
      enableProgress: true,
      parallelProcessing: false,
      autoFallback: true,
      retryAttempts: 3,
      healthCheckInterval: 300000, // 5 minutes
      ...config
    };

    this.strategy = this.createStrategy(this.config.provider);
    this.startHealthCheck();
  }

  private createStrategy(provider: 'langchain' | 'custom' | 'simple'): AgentStrategy {
    switch (provider) {
      case 'langchain':
        return new LangChainStrategy(this.config);
      case 'custom':
        return new CustomStrategy(this.config);
      case 'simple':
        // For now, use CustomStrategy as SimpleStrategy equivalent
        return new CustomStrategy(this.config);
      default:
        throw new Error(`Unsupported agent provider: ${provider}`);
    }
  }

  private startHealthCheck(): void {
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const health = await this.strategy.health();
      this.isHealthy = health.status === 'healthy';
      this.lastHealthCheck = new Date();
      
      if (!this.isHealthy) {
        console.warn('Agent health check failed:', health);
        if (this.config.autoFallback) {
          await this.attemptFallback();
        }
      }
    } catch (error) {
      console.error('Health check error:', error);
      this.isHealthy = false;
      
      if (this.config.autoFallback) {
        await this.attemptFallback();
      }
    }
  }

  private async attemptFallback(): Promise<void> {
    console.log('Attempting fallback to different strategy...');
    
    try {
      // Try fallback strategies in order
      const fallbackOrder: ('langchain' | 'custom' | 'simple')[] = 
        this.config.provider === 'langchain' ? ['custom', 'simple'] :
        this.config.provider === 'custom' ? ['langchain', 'simple'] :
        ['langchain', 'custom'];

      for (const provider of fallbackOrder) {
        try {
          const fallbackStrategy = this.createStrategy(provider);
          await fallbackStrategy.initialize();
          
          const fallbackHealth = await fallbackStrategy.health();
          if (fallbackHealth.status === 'healthy') {
            console.log(`Fallback successful: switched to ${provider} strategy`);
            
            // Cleanup current strategy
            await this.strategy.cleanup();
            
            // Switch to fallback strategy
            this.strategy = fallbackStrategy;
            this.config.provider = provider;
            this.isHealthy = true;
            return;
          }
        } catch (error) {
          console.warn(`Fallback to ${provider} failed:`, error);
        }
      }
      
      console.error('All fallback strategies failed');
    } catch (error) {
      console.error('Fallback attempt failed:', error);
    }
  }

  async initialize(): Promise<void> {
    await this.strategy.initialize();
  }

  async execute(
    query: string,
    taskType: 'research' | 'analysis' | 'synthesis' | 'chat' = 'research',
    options?: {
      onStep?: (step: AgentStep) => void;
      onThought?: (thought: string) => void;
      onProgress?: (progress: { current: number; total: number; message: string }) => void;
      retryAttempts?: number;
    }
  ): Promise<ExecutionResult> {
    const context: ExecutionContext = {
      query,
      taskType,
      options,
      onStep: options?.onStep,
      onThought: options?.onThought,
      onProgress: options?.onProgress,
    };

    const maxRetries = options?.retryAttempts ?? this.config.retryAttempts ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if we need to initialize
        if (!this.isHealthy) {
          await this.performHealthCheck();
        }

        const result = await this.strategy.execute(context);
        
        // Success - return result
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`Execution attempt ${attempt} failed:`, lastError);

        if (attempt < maxRetries) {
          // Try fallback strategy if available
          if (this.config.autoFallback) {
            await this.attemptFallback();
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    throw lastError || new Error('All execution attempts failed');
  }

  async chat(
    message: string,
    options?: {
      onStep?: (step: AgentStep) => void;
      retryAttempts?: number;
    }
  ): Promise<string> {
    const maxRetries = options?.retryAttempts ?? this.config.retryAttempts ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if we need to initialize
        if (!this.isHealthy) {
          await this.performHealthCheck();
        }

        const result = await this.strategy.chat(message, options?.onStep);
        
        // Success - return result
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`Chat attempt ${attempt} failed:`, lastError);

        if (attempt < maxRetries) {
          // Try fallback strategy if available
          if (this.config.autoFallback) {
            await this.attemptFallback();
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    throw lastError || new Error('All chat attempts failed');
  }

  async health(): Promise<{
    status: string;
    strategy: string;
    isHealthy: boolean;
    lastHealthCheck: Date;
    tools: Record<string, boolean>;
    memory: boolean;
    agent: boolean;
  }> {
    const strategyHealth = await this.strategy.health();
    
    return {
      status: this.isHealthy ? 'healthy' : 'degraded',
      strategy: this.config.provider,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      ...strategyHealth,
    };
  }

  // Strategy management methods
  async switchStrategy(
    provider: 'langchain' | 'custom' | 'simple',
    preserveMemory: boolean = true
  ): Promise<void> {
    if (provider === this.config.provider) {
      return; // Already using this strategy
    }

    let oldMemory: any[] = [];
    if (preserveMemory) {
      oldMemory = this.strategy.getMemory();
    }

    // Cleanup current strategy
    await this.strategy.cleanup();

    // Create new strategy
    this.strategy = this.createStrategy(provider);
    this.config.provider = provider;

    // Initialize new strategy
    await this.strategy.initialize();

    // Restore memory if requested (note: this might not work perfectly across strategies)
    if (preserveMemory && oldMemory.length > 0) {
      // TODO: Implement cross-strategy memory transfer
      console.warn('Memory transfer between strategies not fully implemented');
    }

    console.log(`Successfully switched to ${provider} strategy`);
  }

  getCurrentStrategy(): string {
    return this.config.provider;
  }

  updateConfig(newConfig: Partial<UnifiedAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.strategy.updateConfig(newConfig);
  }

  getConfig(): UnifiedAgentConfig {
    return { ...this.config };
  }

  // Memory management
  clearMemory(): void {
    this.strategy.clearMemory();
  }

  getMemory(): any[] {
    return this.strategy.getMemory();
  }

  // Tool management
  getAvailableTools(): string[] {
    return this.strategy.getAvailableTools();
  }

  async getToolCapabilities(toolName: string): Promise<any> {
    return this.strategy.getToolCapabilities(toolName);
  }

  // Cleanup and disposal
  async cleanup(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    await this.strategy.cleanup();
    this.isHealthy = false;
  }

  // Static factory methods for common configurations
  static createResearchAgent(customConfig?: Partial<UnifiedAgentConfig>): UnifiedAgent {
    const config: UnifiedAgentConfig = {
      provider: 'langchain',
      temperature: 0.1,
      maxIterations: 15,
      timeout: 60000,
      enableMemory: true,
      enableProgress: true,
      parallelProcessing: true,
      autoFallback: true,
      retryAttempts: 2,
      ...customConfig
    };

    return new UnifiedAgent(config);
  }

  static createChatAgent(customConfig?: Partial<UnifiedAgentConfig>): UnifiedAgent {
    const config: UnifiedAgentConfig = {
      provider: 'custom',
      temperature: 0.3,
      maxIterations: 5,
      timeout: 30000,
      enableMemory: true,
      enableProgress: false,
      parallelProcessing: false,
      autoFallback: true,
      retryAttempts: 2,
      ...customConfig
    };

    return new UnifiedAgent(config);
  }

  static createAnalysisAgent(customConfig?: Partial<UnifiedAgentConfig>): UnifiedAgent {
    const config: UnifiedAgentConfig = {
      provider: 'langchain',
      temperature: 0.05,
      maxIterations: 20,
      timeout: 120000,
      enableMemory: true,
      enableProgress: true,
      parallelProcessing: true,
      autoFallback: true,
      retryAttempts: 3,
      ...customConfig
    };

    return new UnifiedAgent(config);
  }
} 