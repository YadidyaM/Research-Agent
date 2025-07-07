import { config } from './index';

// Configuration interfaces
export interface DatabaseConfig {
  vectorDb: {
    type: 'chroma' | 'faiss';
    endpoint: string;
    collectionName: string;
    timeout?: number;
  };
}

export interface LLMConfig {
  provider: 'deepseek' | 'openai' | 'huggingface';
  endpoint?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface EmbeddingConfig {
  provider: 'huggingface' | 'openai';
  model: string;
  apiKey?: string;
  dimensions?: number;
  batchSize?: number;
}

export interface ToolsConfig {
  webSearch: {
    provider: 'tavily' | 'serpapi' | 'duckduckgo';
    apiKey?: string;
    tavilyApiKey?: string;
    timeout?: number;
  };
  scraper: {
    timeout: number;
    userAgent: string;
    maxRetries?: number;
  };
  python: {
    endpoint?: string;
    sandboxed: boolean;
    timeout: number;
    allowedPackages?: string[];
  };
}

export interface CacheConfig {
  enabled: boolean;
  memory: {
    maxSize: number;
    maxMemoryMB: number;
  };
  redis: {
    enabled: boolean;
    host: string;
    port: number;
    password?: string;
    database?: number;
    keyPrefix?: string;
    maxRetries?: number;
    retryDelayOnFailover?: number;
    connectTimeout?: number;
    lazyConnect?: boolean;
  };
  writeThrough: boolean;
  readPreference: 'memory-first' | 'redis-first' | 'parallel';
  syncStrategy: 'lazy' | 'immediate' | 'scheduled';
  defaultTTL: number;
}

export interface ServiceConfiguration {
  environment: string;
  port: number;
  database: DatabaseConfig;
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  tools: ToolsConfig;
  cache: CacheConfig;
  cors?: any;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private configuration: ServiceConfiguration;
  private watchers: Map<string, Array<(config: any) => void>> = new Map();

  private constructor() {
    this.configuration = this.loadConfiguration();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadConfiguration(): ServiceConfiguration {
    // Load from environment and existing config
    return {
      environment: config.nodeEnv,
      port: config.port,
      database: {
        vectorDb: {
          type: config.vectorDb.type as 'chroma' | 'faiss',
          endpoint: config.vectorDb.chromaEndpoint || 'http://localhost:8000',
          collectionName: config.vectorDb.collectionName || 'research_memory',
          timeout: 30000
        }
      },
      llm: {
        provider: config.llm.provider as 'deepseek' | 'openai' | 'huggingface',
        endpoint: config.llm.deepseekBaseUrl,
        apiKey: this.getLLMApiKey(),
        model: this.getLLMModel(),
        temperature: 0.1,
        maxTokens: 2000,
        timeout: 60000
      },
      embedding: {
        provider: config.embedding.provider as 'huggingface' | 'openai',
        model: config.embedding.model || 'sentence-transformers/all-MiniLM-L6-v2',
        apiKey: config.embedding.apiKey,
        dimensions: this.getEmbeddingDimensions(),
        batchSize: 10
      },
      tools: {
        webSearch: {
          provider: config.tools.webSearch.provider as 'tavily' | 'serpapi' | 'duckduckgo',
          apiKey: config.tools.webSearch.serpApiKey,
          tavilyApiKey: config.tools.webSearch.tavilyApiKey,
          timeout: 30000
        },
        scraper: {
          timeout: config.tools.scraper.timeout,
          userAgent: config.tools.scraper.userAgent,
          maxRetries: 3
        },
        python: {
          endpoint: config.tools.python.endpoint,
          sandboxed: config.tools.python.sandboxed,
          timeout: config.tools.python.timeout,
          allowedPackages: ['numpy', 'pandas', 'matplotlib', 'requests', 'json', 'os', 'sys']
        }
      },
      cache: {
        enabled: process.env.CACHE_ENABLED === 'true' || true,
        memory: {
          maxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || '10000'),
          maxMemoryMB: parseInt(process.env.CACHE_MEMORY_MAX_MB || '100')
        },
        redis: {
          enabled: process.env.CACHE_REDIS_ENABLED === 'true' || false,
          host: process.env.CACHE_REDIS_HOST || 'localhost',
          port: parseInt(process.env.CACHE_REDIS_PORT || '6379'),
          password: process.env.CACHE_REDIS_PASSWORD,
          database: parseInt(process.env.CACHE_REDIS_DB || '0'),
          keyPrefix: process.env.CACHE_REDIS_KEY_PREFIX || 'cache:',
          maxRetries: parseInt(process.env.CACHE_REDIS_MAX_RETRIES || '3'),
          retryDelayOnFailover: parseInt(process.env.CACHE_REDIS_RETRY_DELAY || '100'),
          connectTimeout: parseInt(process.env.CACHE_REDIS_CONNECT_TIMEOUT || '10000'),
          lazyConnect: process.env.CACHE_REDIS_LAZY_CONNECT === 'true' || false
        },
        writeThrough: process.env.CACHE_WRITE_THROUGH === 'true' || true,
        readPreference: (process.env.CACHE_READ_PREFERENCE as 'memory-first' | 'redis-first' | 'parallel') || 'memory-first',
        syncStrategy: (process.env.CACHE_SYNC_STRATEGY as 'lazy' | 'immediate' | 'scheduled') || 'immediate',
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600')
      },
      cors: config.cors
    };
  }

  private getLLMApiKey(): string | undefined {
    switch (config.llm.provider) {
      case 'deepseek':
        return config.llm.deepseekApiKey;
      case 'openai':
        return config.llm.openaiApiKey;
      case 'huggingface':
        return config.llm.huggingfaceApiKey;
      default:
        return undefined;
    }
  }

  private getLLMModel(): string {
    switch (config.llm.provider) {
      case 'deepseek':
        return config.llm.deepseekModel || 'deepseek-reasoner';
      case 'openai':
        return config.llm.openaiModel || 'gpt-3.5-turbo';
      case 'huggingface':
        return config.llm.openaiModel || 'microsoft/DialoGPT-large';
      default:
        return 'gpt-3.5-turbo';
    }
  }

  private getEmbeddingDimensions(): number {
    const model = config.embedding.model;
    switch (model) {
      case 'sentence-transformers/all-MiniLM-L6-v2':
        return 384;
      case 'sentence-transformers/all-mpnet-base-v2':
        return 768;
      case 'text-embedding-ada-002':
        return 1536;
      case 'text-embedding-3-small':
        return 1536;
      case 'text-embedding-3-large':
        return 3072;
      default:
        return 768;
    }
  }

  // Getter methods
  getConfiguration(): ServiceConfiguration {
    return { ...this.configuration };
  }

  getDatabaseConfig(): DatabaseConfig {
    return { ...this.configuration.database };
  }

  getLLMConfig(): LLMConfig {
    return { ...this.configuration.llm };
  }

  getEmbeddingConfig(): EmbeddingConfig {
    return { ...this.configuration.embedding };
  }

  getToolsConfig(): ToolsConfig {
    return { ...this.configuration.tools };
  }

  getCacheConfig(): CacheConfig {
    return { ...this.configuration.cache };
  }

  // Environment-specific getters
  isProduction(): boolean {
    return this.configuration.environment === 'production';
  }

  isDevelopment(): boolean {
    return this.configuration.environment === 'development';
  }

  isTestEnvironment(): boolean {
    return this.configuration.environment === 'test';
  }

  // Configuration updates
  updateConfiguration(updates: Partial<ServiceConfiguration>): void {
    const oldConfig = { ...this.configuration };
    this.configuration = { ...this.configuration, ...updates };
    
    // Notify watchers
    this.notifyWatchers('configuration', this.configuration);
    
    console.log('Configuration updated:', {
      changed: this.getChangedKeys(oldConfig, this.configuration)
    });
  }

  updateLLMConfig(updates: Partial<LLMConfig>): void {
    const oldConfig = { ...this.configuration.llm };
    this.configuration.llm = { ...this.configuration.llm, ...updates };
    
    this.notifyWatchers('llm', this.configuration.llm);
    
    console.log('LLM configuration updated:', {
      changed: this.getChangedKeys(oldConfig, this.configuration.llm)
    });
  }

  updateDatabaseConfig(updates: Partial<DatabaseConfig['vectorDb']>): void {
    const oldConfig = { ...this.configuration.database.vectorDb };
    this.configuration.database.vectorDb = { ...this.configuration.database.vectorDb, ...updates };
    
    this.notifyWatchers('database', this.configuration.database);
    
    console.log('Database configuration updated:', {
      changed: this.getChangedKeys(oldConfig, this.configuration.database.vectorDb)
    });
  }

  updateEmbeddingConfig(updates: Partial<EmbeddingConfig>): void {
    const oldConfig = { ...this.configuration.embedding };
    this.configuration.embedding = { ...this.configuration.embedding, ...updates };
    
    this.notifyWatchers('embedding', this.configuration.embedding);
    
    console.log('Embedding configuration updated:', {
      changed: this.getChangedKeys(oldConfig, this.configuration.embedding)
    });
  }

  updateCacheConfig(updates: Partial<CacheConfig>): void {
    const oldConfig = { ...this.configuration.cache };
    this.configuration.cache = { ...this.configuration.cache, ...updates };
    
    this.notifyWatchers('cache', this.configuration.cache);
    
    console.log('Cache configuration updated:', {
      changed: this.getChangedKeys(oldConfig, this.configuration.cache)
    });
  }

  // Configuration watching
  watch(key: string, callback: (config: any) => void): void {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key)!.push(callback);
  }

  unwatch(key: string, callback: (config: any) => void): void {
    const callbacks = this.watchers.get(key);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private notifyWatchers(key: string, config: any): void {
    const callbacks = this.watchers.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(config);
        } catch (error) {
          console.error(`Error in configuration watcher for ${key}:`, error);
        }
      });
    }
  }

  private getChangedKeys(oldObj: any, newObj: any): string[] {
    const changed: string[] = [];
    
    for (const key in newObj) {
      if (oldObj[key] !== newObj[key]) {
        changed.push(key);
      }
    }
    
    return changed;
  }

  // Validation
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!this.configuration.llm.apiKey && this.configuration.llm.provider !== 'huggingface') {
      errors.push(`API key required for LLM provider: ${this.configuration.llm.provider}`);
    }

    if (!this.configuration.database.vectorDb.endpoint) {
      errors.push('Vector database endpoint is required');
    }

    if (this.configuration.embedding.provider === 'openai' && !this.configuration.embedding.apiKey) {
      errors.push('API key required for OpenAI embeddings');
    }

    // Validate formats
    try {
      new URL(this.configuration.database.vectorDb.endpoint);
    } catch {
      errors.push('Invalid vector database endpoint URL');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Export/Import configuration
  exportConfiguration(): string {
    const exportConfig = {
      ...this.configuration,
      // Remove sensitive data
      llm: {
        ...this.configuration.llm,
        apiKey: this.configuration.llm.apiKey ? '[REDACTED]' : undefined
      },
      embedding: {
        ...this.configuration.embedding,
        apiKey: this.configuration.embedding.apiKey ? '[REDACTED]' : undefined
      },
      tools: {
        ...this.configuration.tools,
        webSearch: {
          ...this.configuration.tools.webSearch,
          apiKey: this.configuration.tools.webSearch.apiKey ? '[REDACTED]' : undefined,
          tavilyApiKey: this.configuration.tools.webSearch.tavilyApiKey ? '[REDACTED]' : undefined
        }
      }
    };

    return JSON.stringify(exportConfig, null, 2);
  }

  getConfigurationSummary(): {
    environment: string;
    llmProvider: string;
    embeddingProvider: string;
    vectorDatabase: string;
    servicesConfigured: string[];
  } {
    return {
      environment: this.configuration.environment,
      llmProvider: this.configuration.llm.provider,
      embeddingProvider: this.configuration.embedding.provider,
      vectorDatabase: this.configuration.database.vectorDb.type,
      servicesConfigured: [
        'LLM',
        'Embedding',
        'VectorDB',
        'WebSearch',
        'Scraper',
        'Python'
      ]
    };
  }
} 