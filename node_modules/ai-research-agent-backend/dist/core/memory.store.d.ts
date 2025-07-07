import { VectorService } from '../services/vector.service';
import { EmbeddingService } from '../services/embedding.service';
import { MemoryChunk, VectorSearchResult } from '../types';
export declare class MemoryStore {
    private vectorService;
    private embeddingService;
    private memoryTool;
    private isInitialized;
    constructor(vectorService: VectorService, embeddingService: EmbeddingService);
    initialize(): Promise<void>;
    private ensureInitialized;
    storeExperience(experience: {
        context: string;
        action: string;
        result: string;
        success: boolean;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        success: boolean;
    }>;
    storeResearchResult(research: {
        query: string;
        findings: string[];
        summary: string;
        sources: string[];
        confidence: number;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        success: boolean;
    }>;
    storeConversation(conversation: {
        userInput: string;
        agentResponse: string;
        tools_used: string[];
        success: boolean;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        success: boolean;
    }>;
    searchMemories(query: string, options?: {
        limit?: number;
        threshold?: number;
        type?: string;
        source?: string;
    }): Promise<VectorSearchResult[]>;
    getRelatedExperiences(context: string, limit?: number): Promise<VectorSearchResult[]>;
    getSimilarResearch(query: string, limit?: number): Promise<VectorSearchResult[]>;
    getConversationHistory(query: string, limit?: number): Promise<VectorSearchResult[]>;
    getSuccessfulExperiences(context: string, limit?: number): Promise<VectorSearchResult[]>;
    getFailedExperiences(context: string, limit?: number): Promise<VectorSearchResult[]>;
    getMemoryById(id: string): Promise<MemoryChunk | null>;
    updateMemory(id: string, updates: {
        content?: string;
        metadata?: Record<string, any>;
    }): Promise<{
        success: boolean;
    }>;
    deleteMemory(id: string): Promise<{
        success: boolean;
    }>;
    getMemoryStats(): Promise<{
        totalCount: number;
        byType: Record<string, number>;
        bySource: Record<string, number>;
        recentActivity: number;
    }>;
    generateMemorySummary(query: string): Promise<string>;
    consolidateMemories(options?: {
        similarityThreshold?: number;
        maxAge?: number;
    }): Promise<{
        consolidated: number;
        removed: number;
    }>;
    exportMemories(format?: 'json' | 'text'): Promise<string>;
    clearOldMemories(maxAge?: number): Promise<{
        success: boolean;
        deletedCount: number;
    }>;
    health(): Promise<boolean>;
}
//# sourceMappingURL=memory.store.d.ts.map