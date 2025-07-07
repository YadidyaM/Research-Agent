import { ChromaApi, Collection, Where } from 'chromadb';
import { IVectorRepository } from '../interfaces/repositories/IVectorRepository';
import { MemoryChunk, VectorSearchResult } from '../types';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { v4 as uuidv4 } from 'uuid';

export class ChromaVectorRepository implements IVectorRepository {
  private client: ChromaApi | null = null;
  private collection: Collection | null = null;
  private initialized: boolean = false;
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
  }

  async initialize(): Promise<void> {
    try {
      const config = this.configManager.getDatabaseConfig();
      const { ChromaApi } = await import('chromadb');
      
      this.client = new ChromaApi({
        path: config.vectorDb.endpoint,
        timeout: config.vectorDb.timeout
      });

      this.collection = await this.client.getOrCreateCollection({
        name: config.vectorDb.collectionName,
        metadata: {
          'hnsw:space': 'cosine',
          'hnsw:construction_ef': 100,
          'hnsw:M': 16
        }
      });

      this.initialized = true;
      console.log(`ChromaVectorRepository initialized with collection: ${config.vectorDb.collectionName}`);
    } catch (error) {
      console.error('Failed to initialize ChromaVectorRepository:', error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async health(): Promise<boolean> {
    try {
      if (!this.client || !this.collection) {
        return false;
      }
      
      // Simple health check by getting collection info
      await this.collection.count();
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.client = null;
      this.collection = null;
      this.initialized = false;
      console.log('ChromaVectorRepository cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async addDocument(chunk: MemoryChunk): Promise<void> {
    this.ensureInitialized();
    
    try {
      const id = chunk.id || this.generateId();
      const embedding = chunk.embedding || [];
      
      await this.collection!.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [{
          content: chunk.content,
          source: chunk.source,
          type: chunk.type,
          timestamp: chunk.timestamp,
          relevanceScore: chunk.relevanceScore,
          metadata: JSON.stringify(chunk.metadata || {})
        }],
        documents: [chunk.content]
      });
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }

  async addDocuments(chunks: MemoryChunk[]): Promise<void> {
    this.ensureInitialized();
    
    if (chunks.length === 0) return;
    
    try {
      const ids = chunks.map(chunk => chunk.id || this.generateId());
      const embeddings = chunks.map(chunk => chunk.embedding || []);
      const metadatas = chunks.map(chunk => ({
        content: chunk.content,
        source: chunk.source,
        type: chunk.type,
        timestamp: chunk.timestamp,
        relevanceScore: chunk.relevanceScore,
        metadata: JSON.stringify(chunk.metadata || {})
      }));
      const documents = chunks.map(chunk => chunk.content);

      await this.collection!.add({
        ids,
        embeddings,
        metadatas,
        documents
      });
    } catch (error) {
      console.error('Failed to add documents:', error);
      throw error;
    }
  }

  async getDocument(id: string): Promise<MemoryChunk | null> {
    this.ensureInitialized();
    
    try {
      const result = await this.collection!.get({
        ids: [id],
        include: ['embeddings', 'metadatas', 'documents']
      });

      if (!result.ids || result.ids.length === 0) {
        return null;
      }

      const metadata = result.metadatas?.[0] as any;
      const embedding = result.embeddings?.[0] as number[];
      const document = result.documents?.[0] as string;

      return {
        id: result.ids[0],
        content: document,
        embedding,
        source: metadata?.source,
        type: metadata?.type,
        timestamp: metadata?.timestamp,
        relevanceScore: metadata?.relevanceScore,
        metadata: metadata?.metadata ? JSON.parse(metadata.metadata) : undefined
      };
    } catch (error) {
      console.error('Failed to get document:', error);
      return null;
    }
  }

  async updateDocument(id: string, updates: Partial<MemoryChunk>): Promise<void> {
    this.ensureInitialized();
    
    try {
      const existing = await this.getDocument(id);
      if (!existing) {
        throw new Error(`Document with id ${id} not found`);
      }

      const updatedChunk = { ...existing, ...updates };
      
      await this.collection!.update({
        ids: [id],
        embeddings: updatedChunk.embedding ? [updatedChunk.embedding] : undefined,
        metadatas: [{
          content: updatedChunk.content,
          source: updatedChunk.source,
          type: updatedChunk.type,
          timestamp: updatedChunk.timestamp,
          relevanceScore: updatedChunk.relevanceScore,
          metadata: JSON.stringify(updatedChunk.metadata || {})
        }],
        documents: [updatedChunk.content]
      });
    } catch (error) {
      console.error('Failed to update document:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.collection!.delete({
        ids: [id]
      });
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.collection!.delete({
        ids
      });
    } catch (error) {
      console.error('Failed to delete documents:', error);
      throw error;
    }
  }

  async search(queryEmbedding: number[], options: {
    limit?: number;
    threshold?: number;
    where?: Record<string, any>;
  } = {}): Promise<VectorSearchResult[]> {
    this.ensureInitialized();
    
    try {
      const { limit = 10, threshold = 0.0, where } = options;
      
      const result = await this.collection!.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: where as Where,
        include: ['embeddings', 'metadatas', 'documents', 'distances']
      });

      if (!result.ids || result.ids.length === 0) {
        return [];
      }

      const results: VectorSearchResult[] = [];
      const ids = result.ids[0];
      const distances = result.distances?.[0] || [];
      const metadatas = result.metadatas?.[0] || [];
      const documents = result.documents?.[0] || [];
      const embeddings = result.embeddings?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const distance = distances[i];
        const similarity = 1 - distance; // Convert distance to similarity
        
        if (similarity >= threshold) {
          const metadata = metadatas[i] as any;
          
          results.push({
            id: ids[i],
            content: documents[i],
            embedding: embeddings[i] as number[],
            source: metadata?.source,
            type: metadata?.type,
            timestamp: metadata?.timestamp,
            relevanceScore: metadata?.relevanceScore,
            similarity,
            metadata: metadata?.metadata ? JSON.parse(metadata.metadata) : undefined
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to search:', error);
      throw error;
    }
  }

  async searchByText(queryText: string, embedding: number[], options: {
    limit?: number;
    threshold?: number;
    source?: string;
    type?: string;
  } = {}): Promise<VectorSearchResult[]> {
    const where: Record<string, any> = {};
    
    if (options.source) {
      where.source = options.source;
    }
    
    if (options.type) {
      where.type = options.type;
    }

    return this.search(embedding, {
      limit: options.limit,
      threshold: options.threshold,
      where: Object.keys(where).length > 0 ? where : undefined
    });
  }

  async findSimilarDocuments(docId: string, options: {
    limit?: number;
    threshold?: number;
    excludeSelf?: boolean;
  } = {}): Promise<VectorSearchResult[]> {
    this.ensureInitialized();
    
    try {
      const document = await this.getDocument(docId);
      if (!document || !document.embedding) {
        return [];
      }

      const results = await this.search(document.embedding, {
        limit: options.limit,
        threshold: options.threshold
      });

      if (options.excludeSelf !== false) {
        return results.filter(result => result.id !== docId);
      }

      return results;
    } catch (error) {
      console.error('Failed to find similar documents:', error);
      throw error;
    }
  }

  async clearCollection(): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Get all documents first
      const allDocs = await this.collection!.get({
        include: ['embeddings', 'metadatas', 'documents']
      });
      
      if (allDocs.ids && allDocs.ids.length > 0) {
        await this.collection!.delete({
          ids: allDocs.ids
        });
      }
      
      console.log('Collection cleared');
    } catch (error) {
      console.error('Failed to clear collection:', error);
      throw error;
    }
  }

  async getCollectionInfo(): Promise<{
    name: string;
    count: number;
    metadata?: Record<string, any>;
  }> {
    this.ensureInitialized();
    
    try {
      const count = await this.collection!.count();
      const config = this.configManager.getDatabaseConfig();
      
      return {
        name: config.vectorDb.collectionName,
        count,
        metadata: {
          provider: 'chroma',
          endpoint: config.vectorDb.endpoint
        }
      };
    } catch (error) {
      console.error('Failed to get collection info:', error);
      throw error;
    }
  }

  generateId(): string {
    return uuidv4();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client || !this.collection) {
      throw new Error('ChromaVectorRepository not initialized. Call initialize() first.');
    }
  }
} 