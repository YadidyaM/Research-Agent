import { IVectorRepository } from '../interfaces/repositories/IVectorRepository';
import { IEmbeddingRepository } from '../interfaces/repositories/IEmbeddingRepository';
import { ChromaVectorRepository } from '../repositories/ChromaVectorRepository';
import { FaissVectorRepository } from '../repositories/FaissVectorRepository';
import { HuggingFaceEmbeddingRepository } from '../repositories/HuggingFaceEmbeddingRepository';
import { ConfigurationManager } from '../config/ConfigurationManager';

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private configManager: ConfigurationManager;
  private vectorRepository: IVectorRepository | null = null;
  private embeddingRepository: IEmbeddingRepository | null = null;

  private constructor() {
    this.configManager = ConfigurationManager.getInstance();
  }

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  getVectorRepository(): IVectorRepository {
    if (!this.vectorRepository) {
      this.vectorRepository = this.createVectorRepository();
    }
    return this.vectorRepository;
  }

  getEmbeddingRepository(): IEmbeddingRepository {
    if (!this.embeddingRepository) {
      this.embeddingRepository = this.createEmbeddingRepository();
    }
    return this.embeddingRepository;
  }

  private createVectorRepository(): IVectorRepository {
    const config = this.configManager.getDatabaseConfig();
    
    switch (config.vectorDb.type) {
      case 'chroma':
        return new ChromaVectorRepository();
      case 'faiss':
        return new FaissVectorRepository();
      default:
        throw new Error(`Unsupported vector database type: ${config.vectorDb.type}`);
    }
  }

  private createEmbeddingRepository(): IEmbeddingRepository {
    const config = this.configManager.getEmbeddingConfig();
    
    switch (config.provider) {
      case 'huggingface':
        return new HuggingFaceEmbeddingRepository();
      case 'openai':
        // TODO: Implement OpenAI embedding repository
        throw new Error('OpenAI embedding repository not yet implemented');
      default:
        throw new Error(`Unsupported embedding provider: ${config.provider}`);
    }
  }

  // Service lifecycle management
  async initializeRepositories(): Promise<void> {
    try {
      const vectorRepo = this.getVectorRepository();
      const embeddingRepo = this.getEmbeddingRepository();

      // Initialize vector repository
      if ('initialize' in vectorRepo) {
        await vectorRepo.initialize();
        console.log('Vector repository initialized');
      }

      // Embedding repository doesn't need initialization
      console.log('Embedding repository ready');
    } catch (error) {
      console.error('Failed to initialize repositories:', error);
      throw error;
    }
  }

  async checkRepositoryHealth(): Promise<{
    vectorRepository: boolean;
    embeddingRepository: boolean;
  }> {
    const results = {
      vectorRepository: false,
      embeddingRepository: false
    };

    try {
      if (this.vectorRepository) {
        results.vectorRepository = await this.vectorRepository.health();
      }

      if (this.embeddingRepository) {
        // For embedding repository, we can do a simple test
        try {
          await this.embeddingRepository.generateEmbedding('test');
          results.embeddingRepository = true;
        } catch {
          results.embeddingRepository = false;
        }
      }
    } catch (error) {
      console.error('Error checking repository health:', error);
    }

    return results;
  }

  async cleanupRepositories(): Promise<void> {
    try {
      if (this.vectorRepository) {
        await this.vectorRepository.cleanup();
        this.vectorRepository = null;
      }

      if (this.embeddingRepository) {
        // No cleanup needed for embedding repository
        this.embeddingRepository = null;
      }

      console.log('Repositories cleaned up');
    } catch (error) {
      console.error('Error during repository cleanup:', error);
    }
  }

  // Configuration updates
  async reconfigureRepositories(): Promise<void> {
    await this.cleanupRepositories();
    await this.initializeRepositories();
  }

  // Repository information
  getRepositoryInfo(): {
    vectorDatabase: {
      type: string;
      initialized: boolean;
    };
    embeddingProvider: {
      type: string;
      model: string;
    };
  } {
    const dbConfig = this.configManager.getDatabaseConfig();
    const embeddingConfig = this.configManager.getEmbeddingConfig();

    return {
      vectorDatabase: {
        type: dbConfig.vectorDb.type,
        initialized: this.vectorRepository ? this.vectorRepository.isInitialized() : false
      },
      embeddingProvider: {
        type: embeddingConfig.provider,
        model: embeddingConfig.model
      }
    };
  }
} 