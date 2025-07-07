import { MemoryChunk, VectorSearchResult } from '../../types';

export interface IVectorRepository {
  // Connection management
  initialize(): Promise<void>;
  isInitialized(): boolean;
  health(): Promise<boolean>;
  cleanup(): Promise<void>;

  // Document operations
  addDocument(chunk: MemoryChunk): Promise<void>;
  addDocuments(chunks: MemoryChunk[]): Promise<void>;
  getDocument(id: string): Promise<MemoryChunk | null>;
  updateDocument(id: string, updates: Partial<MemoryChunk>): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  deleteDocuments(ids: string[]): Promise<void>;

  // Search operations
  search(queryEmbedding: number[], options?: {
    limit?: number;
    threshold?: number;
    where?: Record<string, any>;
  }): Promise<VectorSearchResult[]>;

  searchByText(queryText: string, embedding: number[], options?: {
    limit?: number;
    threshold?: number;
    source?: string;
    type?: string;
  }): Promise<VectorSearchResult[]>;

  findSimilarDocuments(docId: string, options?: {
    limit?: number;
    threshold?: number;
    excludeSelf?: boolean;
  }): Promise<VectorSearchResult[]>;

  // Collection management
  clearCollection(): Promise<void>;
  getCollectionInfo(): Promise<{
    name: string;
    count: number;
    metadata?: Record<string, any>;
  }>;

  // Utility
  generateId(): string;
} 