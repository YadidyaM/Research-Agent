import { IVectorRepository } from '../interfaces/repositories/IVectorRepository';
import { MemoryChunk, VectorSearchResult } from '../types';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// FAISS will be imported dynamically to handle potential installation issues
let IndexFlatL2: any;
let IndexFlatIP: any;
let MetricType: any;

export class FaissVectorRepository implements IVectorRepository {
  private index: any = null;
  private metadataStore: Map<string, MemoryChunk> = new Map();
  private initialized: boolean = false;
  private configManager: ConfigurationManager;
  private dimension: number = 0;
  private indexPath: string;
  private metadataPath: string;
  private useInnerProduct: boolean = false;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
    
    // Set up file paths for persistence
    const config = this.configManager.getDatabaseConfig();
    const dataDir = config.vectorDb.dataPath || './data/faiss';
    this.indexPath = path.join(dataDir, `${config.vectorDb.collectionName}.index`);
    this.metadataPath = path.join(dataDir, `${config.vectorDb.collectionName}.metadata.json`);
    
    // Create data directory if it doesn't exist
    const dir = path.dirname(this.indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import of faiss-node to handle potential installation issues
      const faiss = await this.loadFaissModule();
      IndexFlatL2 = faiss.IndexFlatL2;
      IndexFlatIP = faiss.IndexFlatIP;
      MetricType = faiss.MetricType;

      const config = this.configManager.getDatabaseConfig();
      this.dimension = config.vectorDb.dimension || 1536; // Default to OpenAI embedding dimension
      this.useInnerProduct = config.vectorDb.metric === 'inner_product';

      // Try to load existing index
      if (await this.loadPersistedIndex()) {
        console.log(`✅ FAISS repository loaded from disk with ${this.index.ntotal()} vectors`);
      } else {
        // Create new index
        if (this.useInnerProduct) {
          this.index = new IndexFlatIP(this.dimension);
        } else {
          this.index = new IndexFlatL2(this.dimension);
        }
        console.log(`✅ FAISS repository initialized with ${this.useInnerProduct ? 'Inner Product' : 'L2'} metric`);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize FAISS repository:', error);
      console.warn('⚠️  FAISS repository will use fallback mode (in-memory only)');
      
      // Initialize fallback in-memory storage
      this.metadataStore = new Map();
      this.initialized = true;
      throw error;
    }
  }

  private async loadFaissModule(): Promise<any> {
    try {
      // Try to load faiss-node
      return await import('faiss-node');
    } catch (error) {
      console.error('FAISS module not found. Please install it with: npm install faiss-node');
      throw new Error('FAISS module not available. Install with: npm install faiss-node');
    }
  }

  private async loadPersistedIndex(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.indexPath) || !fs.existsSync(this.metadataPath)) {
        return false;
      }

      // Create new index instance
      if (this.useInnerProduct) {
        this.index = new IndexFlatIP(this.dimension);
      } else {
        this.index = new IndexFlatL2(this.dimension);
      }

      // Load the index from file
      this.index.load(this.indexPath);

      // Load metadata
      const metadataJson = fs.readFileSync(this.metadataPath, 'utf8');
      const metadata = JSON.parse(metadataJson);
      
      this.metadataStore = new Map();
      for (const [id, chunk] of Object.entries(metadata)) {
        this.metadataStore.set(id, chunk as MemoryChunk);
      }

      return true;
    } catch (error) {
      console.warn('Failed to load persisted FAISS index:', error);
      return false;
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.index) return;

    try {
      // Save the FAISS index
      this.index.save(this.indexPath);

      // Save metadata
      const metadataObj: Record<string, MemoryChunk> = {};
      for (const [id, chunk] of this.metadataStore) {
        metadataObj[id] = chunk;
      }
      
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadataObj, null, 2));
    } catch (error) {
      console.warn('Failed to save FAISS index:', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async health(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }

      // For FAISS, we can check if we can get the total count
      if (this.index) {
        this.index.ntotal();
        return true;
      }

      // Fallback mode is always "healthy"
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Save current state before cleanup
      await this.saveIndex();
      
      this.index = null;
      this.metadataStore.clear();
      this.initialized = false;
      
      console.log('✅ FAISS repository cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async addDocument(chunk: MemoryChunk): Promise<void> {
    this.ensureInitialized();
    
    if (!chunk.embedding || chunk.embedding.length === 0) {
      throw new Error('Document must have an embedding vector');
    }

    if (chunk.embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension ${chunk.embedding.length} does not match index dimension ${this.dimension}`);
    }

    try {
      const id = chunk.id || this.generateId();
      chunk.id = id;

      if (this.index) {
        // Add to FAISS index
        this.index.add([chunk.embedding]);
        
        // Store metadata separately
        this.metadataStore.set(id, chunk);
        
        // Periodically save to disk
        if (this.index.ntotal() % 100 === 0) {
          await this.saveIndex();
        }
      } else {
        // Fallback: just store in metadata
        this.metadataStore.set(id, chunk);
      }
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }

  async addDocuments(chunks: MemoryChunk[]): Promise<void> {
    this.ensureInitialized();
    
    if (chunks.length === 0) return;

    try {
      const validChunks = chunks.filter(chunk => {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          console.warn('Skipping document without embedding');
          return false;
        }
        if (chunk.embedding.length !== this.dimension) {
          console.warn(`Skipping document with wrong embedding dimension: ${chunk.embedding.length} vs ${this.dimension}`);
          return false;
        }
        return true;
      });

      if (validChunks.length === 0) {
        console.warn('No valid documents to add');
        return;
      }

      // Ensure all chunks have IDs
      validChunks.forEach(chunk => {
        if (!chunk.id) {
          chunk.id = this.generateId();
        }
      });

      if (this.index) {
        // Extract embeddings for FAISS
        const embeddings = validChunks.map(chunk => chunk.embedding!);
        
        // Add to FAISS index in batch
        this.index.add(embeddings);
        
        // Store metadata
        validChunks.forEach(chunk => {
          this.metadataStore.set(chunk.id!, chunk);
        });
        
        // Save to disk
        await this.saveIndex();
      } else {
        // Fallback: just store in metadata
        validChunks.forEach(chunk => {
          this.metadataStore.set(chunk.id!, chunk);
        });
      }

      console.log(`✅ Added ${validChunks.length} documents to FAISS repository`);
    } catch (error) {
      console.error('Failed to add documents:', error);
      throw error;
    }
  }

  async getDocument(id: string): Promise<MemoryChunk | null> {
    this.ensureInitialized();
    
    try {
      return this.metadataStore.get(id) || null;
    } catch (error) {
      console.error('Failed to get document:', error);
      return null;
    }
  }

  async updateDocument(id: string, updates: Partial<MemoryChunk>): Promise<void> {
    this.ensureInitialized();
    
    try {
      const existing = this.metadataStore.get(id);
      if (!existing) {
        throw new Error(`Document with id ${id} not found`);
      }

      const updatedChunk = { ...existing, ...updates };
      
      // If embedding is updated, we need to rebuild the index
      if (updates.embedding && this.index) {
        console.warn('Updating embeddings requires rebuilding the FAISS index');
        // For now, just update metadata
        this.metadataStore.set(id, updatedChunk);
        await this.saveIndex();
      } else {
        // Just update metadata
        this.metadataStore.set(id, updatedChunk);
        await this.saveIndex();
      }
    } catch (error) {
      console.error('Failed to update document:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      if (!this.metadataStore.has(id)) {
        console.warn(`Document with id ${id} not found for deletion`);
        return;
      }

      // Remove from metadata
      this.metadataStore.delete(id);
      
      // Note: FAISS doesn't support individual deletions efficiently
      // We would need to rebuild the index to properly remove vectors
      console.warn('FAISS index may contain orphaned vectors. Consider rebuilding for optimal performance.');
      
      await this.saveIndex();
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    this.ensureInitialized();
    
    try {
      let deletedCount = 0;
      
      for (const id of ids) {
        if (this.metadataStore.has(id)) {
          this.metadataStore.delete(id);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        console.warn(`Deleted ${deletedCount} documents. FAISS index may contain orphaned vectors.`);
        await this.saveIndex();
      }
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
    
    if (queryEmbedding.length !== this.dimension) {
      throw new Error(`Query embedding dimension ${queryEmbedding.length} does not match index dimension ${this.dimension}`);
    }

    try {
      const limit = options.limit || 10;
      
      if (!this.index || this.index.ntotal() === 0) {
        return [];
      }

      // Perform FAISS search
      const results = this.index.search([queryEmbedding], limit);
      
      if (!results || !results.labels || !results.distances) {
        return [];
      }

      // Convert FAISS results to our format
      const searchResults: VectorSearchResult[] = [];
      const metadataArray = Array.from(this.metadataStore.values());
      
      for (let i = 0; i < results.labels.length; i++) {
        const idx = results.labels[i];
        const distance = results.distances[i];
        
        // Skip invalid results
        if (idx < 0 || idx >= metadataArray.length) continue;
        
        const chunk = metadataArray[idx];
        if (!chunk) continue;

        // Apply threshold filter
        if (options.threshold !== undefined && distance > options.threshold) {
          continue;
        }

        // Apply metadata filters
        if (options.where && !this.matchesFilter(chunk, options.where)) {
          continue;
        }

        // Convert distance to similarity score (0-1, higher is better)
        const similarity = this.useInnerProduct ? distance : Math.exp(-distance);

        searchResults.push({
          id: chunk.id!,
          content: chunk.content,
          source: chunk.source,
          type: chunk.type,
          timestamp: chunk.timestamp,
          relevanceScore: similarity,
          distance: distance,
          metadata: chunk.metadata
        });
      }

      return searchResults.slice(0, limit);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  async searchByText(queryText: string, embedding: number[], options: {
    limit?: number;
    threshold?: number;
    source?: string;
    type?: string;
  } = {}): Promise<VectorSearchResult[]> {
    // Convert text-based filters to where clause
    const where: Record<string, any> = {};
    if (options.source) where.source = options.source;
    if (options.type) where.type = options.type;

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
      const document = this.metadataStore.get(docId);
      if (!document || !document.embedding) {
        return [];
      }

      const results = await this.search(document.embedding, {
        limit: (options.limit || 10) + (options.excludeSelf ? 1 : 0),
        threshold: options.threshold
      });

      // Filter out the document itself if requested
      if (options.excludeSelf) {
        return results.filter(result => result.id !== docId).slice(0, options.limit || 10);
      }

      return results;
    } catch (error) {
      console.error('Failed to find similar documents:', error);
      return [];
    }
  }

  async clearCollection(): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Create new empty index
      if (this.useInnerProduct) {
        this.index = new IndexFlatIP(this.dimension);
      } else {
        this.index = new IndexFlatL2(this.dimension);
      }
      
      // Clear metadata
      this.metadataStore.clear();
      
      // Save empty state
      await this.saveIndex();
      
      console.log('✅ FAISS collection cleared');
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
      const config = this.configManager.getDatabaseConfig();
      const count = this.index ? this.index.ntotal() : this.metadataStore.size;
      
      return {
        name: config.vectorDb.collectionName,
        count,
        metadata: {
          dimension: this.dimension,
          metric: this.useInnerProduct ? 'inner_product' : 'l2',
          indexType: 'FAISS',
          indexPath: this.indexPath,
          metadataPath: this.metadataPath
        }
      };
    } catch (error) {
      console.error('Failed to get collection info:', error);
      return {
        name: 'faiss_collection',
        count: 0
      };
    }
  }

  generateId(): string {
    return uuidv4();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FAISS repository not initialized. Call initialize() first.');
    }
  }

  private matchesFilter(chunk: MemoryChunk, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key === 'metadata' && chunk.metadata) {
        // Handle nested metadata filtering
        for (const [metaKey, metaValue] of Object.entries(value)) {
          if (chunk.metadata[metaKey] !== metaValue) {
            return false;
          }
        }
      } else {
        // Direct property filtering
        const chunkValue = (chunk as any)[key];
        if (chunkValue !== value) {
          return false;
        }
      }
    }
    return true;
  }
} 