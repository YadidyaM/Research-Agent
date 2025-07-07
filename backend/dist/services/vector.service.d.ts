import { MemoryChunk, VectorSearchResult } from '../types';
export declare class VectorService {
    private client;
    private collection?;
    private collectionName;
    private isInitialized;
    constructor(endpoint: string, collectionName: string);
    initialize(): Promise<void>;
    private ensureInitialized;
    addDocument(chunk: MemoryChunk): Promise<void>;
    addDocuments(chunks: MemoryChunk[]): Promise<void>;
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
    getDocument(id: string): Promise<MemoryChunk | null>;
    updateDocument(id: string, updates: Partial<MemoryChunk>): Promise<void>;
    deleteDocument(id: string): Promise<void>;
    deleteDocuments(ids: string[]): Promise<void>;
    clearCollection(): Promise<void>;
    getCollectionInfo(): Promise<{
        name: string;
        count: number;
        metadata?: Record<string, any>;
    }>;
    findSimilarDocuments(docId: string, options?: {
        limit?: number;
        threshold?: number;
        excludeSelf?: boolean;
    }): Promise<VectorSearchResult[]>;
    generateId(): string;
    health(): Promise<boolean>;
}
//# sourceMappingURL=vector.service.d.ts.map