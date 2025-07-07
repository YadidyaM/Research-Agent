import { VectorService } from './vector.service';
import { EmbeddingService } from './embedding.service';
import { LLMService } from './llm.service';
import { MemoryTool } from '../tools/MemoryTool';
import { ILLMService } from '../interfaces/services/ILLMService';
import { IVectorRepository } from '../interfaces/repositories/IVectorRepository';
import { IEmbeddingRepository } from '../interfaces/repositories/IEmbeddingRepository';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { RepositoryFactory } from '../factories/RepositoryFactory';
import { CacheService } from './CacheService';
import { config } from '../config';

export interface ServiceFactoryConfig {
  vectorDb?: {
    endpoint?: string;
    collectionName?: string;
  };
  embedding?: {
    provider?: 'huggingface' | 'openai';
    model?: string;
    apiKey?: string;
  };
}

export class ServiceFactory {
  private static instance: ServiceFactory;
  private vectorService?: VectorService;
  private embeddingService?: EmbeddingService;
  private llmService?: ILLMService;
  private memoryTool?: MemoryTool;
  private cacheService?: CacheService;
  private isInitialized: boolean = false;
  private configManager: ConfigurationManager;
  private repositoryFactory: RepositoryFactory;

  private constructor() {
    this.configManager = ConfigurationManager.getInstance();
    this.repositoryFactory = RepositoryFactory.getInstance();
  }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  async initialize(customConfig?: ServiceFactoryConfig): Promise<void> {
    if (this.isInitialized) {
      return; // Already initialized
    }

    // Apply custom configuration if provided
    if (customConfig) {
      const updates: any = {};
      
      if (customConfig.vectorDb) {
        updates.database = {
          vectorDb: {
            endpoint: customConfig.vectorDb.endpoint,
            collectionName: customConfig.vectorDb.collectionName
          }
        };
      }
      
      if (customConfig.embedding) {
        updates.embedding = {
          provider: customConfig.embedding.provider,
          model: customConfig.embedding.model,
          apiKey: customConfig.embedding.apiKey
        };
      }
      
      if (Object.keys(updates).length > 0) {
        this.configManager.updateConfiguration(updates);
      }
    }

    try {
      console.log('🔧 Initializing services with new architecture...');

      // Initialize repositories first
      console.log('  🗄️ Initializing repositories...');
      await this.repositoryFactory.initializeRepositories();

      // Create services using the new architecture
      console.log('  📊 Creating embedding service...');
      const embeddingConfig = this.configManager.getEmbeddingConfig();
      this.embeddingService = new EmbeddingService(
        embeddingConfig.provider as 'huggingface' | 'openai',
        embeddingConfig.model,
        embeddingConfig.apiKey
      );

      console.log('  🗄️ Creating vector service...');
      const vectorConfig = this.configManager.getDatabaseConfig();
      this.vectorService = new VectorService(
        vectorConfig.vectorDb.endpoint,
        vectorConfig.vectorDb.collectionName
      );

      // Initialize vector database
      await this.vectorService.initialize();

      // Create LLM service
      console.log('  🤖 Creating LLM service...');
      this.llmService = new LLMService();

      // Create cache service
      console.log('  🗄️ Creating cache service...');
      this.cacheService = CacheService.getInstance();

      // Create MemoryTool with proper dependencies
      console.log('  🧠 Creating memory tool with dependencies...');
      this.memoryTool = new MemoryTool(this.vectorService, this.embeddingService);

      // Test the services
      await this.validateServices();

      this.isInitialized = true;
      console.log('✅ Service factory initialization complete');

    } catch (error) {
      console.error('❌ Service factory initialization failed:', error);
      throw new Error(`Service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateServices(): Promise<void> {
    try {
      // Test vector service
      if (this.vectorService) {
        const isHealthy = await this.vectorService.health();
        if (!isHealthy) {
          throw new Error('Vector service health check failed');
        }
      }

      // Test embedding service with a simple text
      if (this.embeddingService) {
        const testEmbedding = await this.embeddingService.generateEmbedding('test');
        if (!testEmbedding || testEmbedding.length === 0) {
          throw new Error('Embedding service test failed');
        }
      }

      // Test memory tool
      if (this.memoryTool) {
        const healthCheck = await this.memoryTool.health();
        if (!healthCheck) {
          throw new Error('Memory tool health check failed');
        }
      }

    } catch (error) {
      console.warn('Service validation warning:', error);
      // Don't throw here - services might still be functional
    }
  }

  getVectorService(): VectorService {
    if (!this.isInitialized || !this.vectorService) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
    return this.vectorService;
  }

  getEmbeddingService(): EmbeddingService {
    if (!this.isInitialized || !this.embeddingService) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
    return this.embeddingService;
  }

  getLLMService(): ILLMService {
    if (!this.isInitialized || !this.llmService) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
    return this.llmService;
  }

  getMemoryTool(): MemoryTool {
    if (!this.isInitialized || !this.memoryTool) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
    return this.memoryTool;
  }

  getCacheService(): CacheService {
    if (!this.isInitialized || !this.cacheService) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
    return this.cacheService;
  }

  async createMemoryTool(): Promise<MemoryTool> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.getMemoryTool();
  }

  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  async reinitialize(customConfig?: ServiceFactoryConfig): Promise<void> {
    await this.cleanup();
    this.isInitialized = false;
    await this.initialize(customConfig);
  }

  async cleanup(): Promise<void> {
    await this.repositoryFactory.cleanupRepositories();
    delete this.vectorService;
    delete this.embeddingService;
    delete this.llmService;
    delete this.memoryTool;
    delete this.cacheService;
    this.isInitialized = false;
    console.log('🧹 Service factory cleanup complete');
  }

  async getServiceHealth(): Promise<{
    vectorService: boolean;
    embeddingService: boolean;
    memoryTool: boolean;
    cacheService: boolean;
    overall: boolean;
  }> {
    const health = {
      vectorService: false,
      embeddingService: false,
      memoryTool: false,
      cacheService: false,
      overall: false
    };

    try {
      if (this.vectorService) {
        health.vectorService = await this.vectorService.health();
      }

      if (this.embeddingService) {
        try {
          // Test with a simple embedding
          await this.embeddingService.generateEmbedding('health check');
          health.embeddingService = true;
        } catch {
          health.embeddingService = false;
        }
      }

      if (this.memoryTool) {
        health.memoryTool = await this.memoryTool.health();
      }

      if (this.cacheService) {
        health.cacheService = await this.cacheService.ping();
      }

      health.overall = health.vectorService && health.embeddingService && health.memoryTool && health.cacheService;

    } catch (error) {
      console.error('Health check error:', error);
    }

    return health;
  }

  getServiceInfo(): {
    isInitialized: boolean;
    vectorEndpoint?: string;
    embeddingProvider?: string;
    embeddingModel?: string;
    collectionName?: string;
  } {
    return {
      isInitialized: this.isInitialized,
      vectorEndpoint: config.vectorDb.chromaEndpoint,
      embeddingProvider: config.embedding.provider,
      embeddingModel: config.embedding.model,
      collectionName: config.vectorDb.collectionName
    };
  }

  // Factory methods for creating individual services
  static async createVectorService(endpoint?: string, collectionName?: string): Promise<VectorService> {
    const vectorService = new VectorService(
      endpoint || config.vectorDb.chromaEndpoint || 'http://localhost:8000',
      collectionName || config.vectorDb.collectionName || 'research_memory'
    );
    
    await vectorService.initialize();
    return vectorService;
  }

  static createEmbeddingService(
    provider?: 'huggingface' | 'openai',
    model?: string,
    apiKey?: string
  ): EmbeddingService {
    const embeddingProvider = provider || config.embedding.provider as 'huggingface' | 'openai' || 'huggingface';
    const embeddingApiKey = apiKey || 
      (embeddingProvider === 'huggingface' ? config.embedding.huggingfaceApiKey : config.embedding.openaiApiKey);
    
    return new EmbeddingService(
      embeddingProvider,
      model || config.embedding.model || 'sentence-transformers/all-MiniLM-L6-v2',
      embeddingApiKey
    );
  }

  static async createMemoryTool(
    vectorService?: VectorService,
    embeddingService?: EmbeddingService
  ): Promise<MemoryTool> {
    const vector = vectorService || await ServiceFactory.createVectorService();
    const embedding = embeddingService || ServiceFactory.createEmbeddingService();
    
    return new MemoryTool(vector, embedding);
  }

  // Memory persistence management
  async exportMemoryData(format: 'json' | 'text' = 'json'): Promise<string> {
    const memoryTool = this.getMemoryTool();
    return await memoryTool.exportMemories({ format });
  }

  async importMemoryData(data: Array<{
    content: string;
    metadata?: Record<string, any>;
  }>): Promise<{
    imported: number;
    failed: number;
    errors: string[];
  }> {
    const memoryTool = this.getMemoryTool();
    return await memoryTool.bulkImportMemories(data);
  }

  async optimizeMemoryStorage(): Promise<{
    duplicatesRemoved: number;
    orphansRemoved: number;
    totalOptimized: number;
  }> {
    const memoryTool = this.getMemoryTool();
    return await memoryTool.optimizeMemoryStorage();
  }

  async getMemoryInsights(): Promise<{
    totalMemories: number;
    averageContentLength: number;
    mostCommonTypes: Array<{ type: string; count: number }>;
    recentActivity: Array<{ date: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
  }> {
    const memoryTool = this.getMemoryTool();
    return await memoryTool.getMemoryInsights();
  }

  async clearMemoryData(options: {
    type?: string;
    source?: string;
    confirm?: boolean;
  } = {}): Promise<{ success: boolean; deletedCount: number }> {
    const memoryTool = this.getMemoryTool();
    return await memoryTool.clearMemories(options);
  }
} 