import { Tool, VectorSearchResult } from '../types';
import { VectorService } from '../services/vector.service';
import { EmbeddingService } from '../services/embedding.service';
export declare class MemoryTool implements Tool {
    name: string;
    description: string;
    private vectorService;
    private embeddingService;
    constructor(vectorService: VectorService, embeddingService: EmbeddingService);
    execute(input: {
        action: 'store' | 'search' | 'retrieve' | 'update' | 'delete' | 'batch_store' | 'batch_search' | 'batch_delete';
        content?: string;
        query?: string;
        id?: string;
        metadata?: Record<string, any>;
        limit?: number;
        threshold?: number;
        items?: Array<{
            content?: string;
            metadata?: Record<string, any>;
            id?: string;
        }>;
        queries?: string[];
        ids?: string[];
    }): Promise<any>;
    private storeMemory;
    private searchMemory;
    private retrieveMemory;
    private updateMemory;
    private deleteMemory;
    storeResearchFindings(findings: {
        query: string;
        sources: string[];
        content: string;
        summary: string;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        success: boolean;
    }>;
    searchSimilarResearch(query: string, limit?: number): Promise<VectorSearchResult[]>;
    storeConversationContext(context: {
        userMessage: string;
        agentResponse: string;
        tools_used?: string[];
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        success: boolean;
    }>;
    getRecentMemories(limit?: number, type?: string): Promise<VectorSearchResult[]>;
    getMemoryStats(): Promise<{
        totalCount: number;
        byType: Record<string, number>;
        bySource: Record<string, number>;
    }>;
    findRelatedMemories(memoryId: string, limit?: number): Promise<VectorSearchResult[]>;
    summarizeMemories(memories: VectorSearchResult[], maxLength?: number): Promise<string>;
    exportMemories(options?: {
        type?: string;
        source?: string;
        format?: 'json' | 'text';
    }): Promise<string>;
    clearMemories(options?: {
        type?: string;
        source?: string;
        confirm?: boolean;
    }): Promise<{
        success: boolean;
        deletedCount: number;
    }>;
    health(): Promise<boolean>;
    batchStoreMemories(input: {
        items?: Array<{
            content?: string;
            metadata?: Record<string, any>;
        }>;
    }): Promise<{
        results: Array<{
            id: string;
            success: boolean;
            error?: string;
        }>;
        totalSuccess: number;
        totalFailed: number;
    }>;
    batchSearchMemories(input: {
        queries?: string[];
        limit?: number;
        threshold?: number;
    }): Promise<{
        results: Array<{
            query: string;
            memories: VectorSearchResult[];
            success: boolean;
            error?: string;
        }>;
        totalSuccess: number;
        totalFailed: number;
    }>;
    batchDeleteMemories(input: {
        ids?: string[];
    }): Promise<{
        results: Array<{
            id: string;
            success: boolean;
            error?: string;
        }>;
        totalSuccess: number;
        totalFailed: number;
    }>;
    bulkImportMemories(data: Array<{
        content: string;
        metadata?: Record<string, any>;
    }>): Promise<{
        imported: number;
        failed: number;
        errors: string[];
    }>;
    optimizeMemoryStorage(): Promise<{
        duplicatesRemoved: number;
        orphansRemoved: number;
        totalOptimized: number;
    }>;
    getMemoryInsights(): Promise<{
        totalMemories: number;
        averageContentLength: number;
        mostCommonTypes: Array<{
            type: string;
            count: number;
        }>;
        recentActivity: Array<{
            date: string;
            count: number;
        }>;
        topSources: Array<{
            source: string;
            count: number;
        }>;
    }>;
    searchMemoriesWithFilters(filters: {
        query?: string;
        types?: string[];
        sources?: string[];
        dateRange?: {
            start: Date;
            end: Date;
        };
        contentLength?: {
            min?: number;
            max?: number;
        };
        limit?: number;
        threshold?: number;
    }): Promise<VectorSearchResult[]>;
}
//# sourceMappingURL=MemoryTool.d.ts.map