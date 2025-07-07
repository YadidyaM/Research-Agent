import { Tool, VectorSearchResult, MemoryChunk } from '../types';
import { VectorService } from '../services/vector.service';
import { EmbeddingService } from '../services/embedding.service';
import { v4 as uuidv4 } from 'uuid';

export class MemoryTool implements Tool {
  name = 'memory';
  description = 'Store and retrieve information from the agent\'s long-term memory using vector search';

  private vectorService: VectorService;
  private embeddingService: EmbeddingService;

  constructor(vectorService: VectorService, embeddingService: EmbeddingService) {
    this.vectorService = vectorService;
    this.embeddingService = embeddingService;
  }

  async execute(input: {
    action: 'store' | 'search' | 'retrieve' | 'update' | 'delete' | 'batch_store' | 'batch_search' | 'batch_delete';
    content?: string;
    query?: string;
    id?: string;
    metadata?: Record<string, any>;
    limit?: number;
    threshold?: number;
    // Batch operations
    items?: Array<{
      content?: string;
      metadata?: Record<string, any>;
      id?: string;
    }>;
    queries?: string[];
    ids?: string[];
  }): Promise<any> {
    const { action } = input;

    try {
      switch (action) {
        case 'store':
          return await this.storeMemory(input);
        
        case 'search':
          return await this.searchMemory(input);
        
        case 'retrieve':
          return await this.retrieveMemory(input);
        
        case 'update':
          return await this.updateMemory(input);
        
        case 'delete':
          return await this.deleteMemory(input);
        
        case 'batch_store':
          return await this.batchStoreMemories(input);
        
        case 'batch_search':
          return await this.batchSearchMemories(input);
        
        case 'batch_delete':
          return await this.batchDeleteMemories(input);
        
        default:
          throw new Error(`Unsupported memory action: ${action}`);
      }
    } catch (error) {
      console.error('Memory tool error:', error);
      throw new Error(`Memory operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async storeMemory(input: {
    content?: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    const { content, metadata = {} } = input;

    if (!content) {
      throw new Error('Content is required for storing memory');
    }

    try {
      // Generate embedding for the content
      const embedding = await this.embeddingService.generateEmbedding(content);

      // Create memory chunk
      const memoryChunk: MemoryChunk = {
        id: uuidv4(),
        content,
        embedding,
        metadata: {
          ...metadata,
          timestamp: new Date(),
          source: metadata.source || 'agent',
          type: metadata.type || 'general',
        },
      };

      // Store in vector database
      await this.vectorService.addDocument(memoryChunk);

      return {
        id: memoryChunk.id,
        success: true,
      };
    } catch (error) {
      console.error('Failed to store memory:', error);
      throw new Error(`Failed to store memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchMemory(input: {
    query?: string;
    limit?: number;
    threshold?: number;
    source?: string;
    type?: string;
  }): Promise<VectorSearchResult[]> {
    const { query, limit = 10, threshold = 0.5, source, type } = input;

    if (!query) {
      throw new Error('Query is required for searching memory');
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Search in vector database
      const searchOptions: any = { limit, threshold };
      if (source) searchOptions.source = source;
      if (type) searchOptions.type = type;
      
      const results = await this.vectorService.searchByText(
        query,
        queryEmbedding,
        searchOptions
      );

      return results;
    } catch (error) {
      console.error('Failed to search memory:', error);
      throw new Error(`Failed to search memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async retrieveMemory(input: {
    id?: string;
  }): Promise<MemoryChunk | null> {
    const { id } = input;

    if (!id) {
      throw new Error('ID is required for retrieving memory');
    }

    try {
      return await this.vectorService.getDocument(id);
    } catch (error) {
      console.error('Failed to retrieve memory:', error);
      throw new Error(`Failed to retrieve memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async updateMemory(input: {
    id?: string;
    content?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean }> {
    const { id, content, metadata } = input;

    if (!id) {
      throw new Error('ID is required for updating memory');
    }

    try {
      const updates: Partial<MemoryChunk> = {};

      if (content) {
        updates.content = content;
        updates.embedding = await this.embeddingService.generateEmbedding(content);
      }

      if (metadata) {
        // Get the existing document to preserve required metadata fields
        const existingDoc = await this.vectorService.getDocument(id);
        const existingMetadata = existingDoc?.metadata || {
          source: 'agent',
          timestamp: new Date(),
          type: 'general',
        };
        
        updates.metadata = {
          ...existingMetadata,
          ...metadata,
          updatedAt: new Date(),
        };
      }

      await this.vectorService.updateDocument(id, updates);

      return { success: true };
    } catch (error) {
      console.error('Failed to update memory:', error);
      throw new Error(`Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async deleteMemory(input: {
    id?: string;
  }): Promise<{ success: boolean }> {
    const { id } = input;

    if (!id) {
      throw new Error('ID is required for deleting memory');
    }

    try {
      await this.vectorService.deleteDocument(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete memory:', error);
      throw new Error(`Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async storeResearchFindings(findings: {
    query: string;
    sources: string[];
    content: string;
    summary: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    const { query, sources, content, summary, metadata = {} } = findings;

    const researchContent = `
Research Query: ${query}

Summary: ${summary}

Sources: ${sources.join(', ')}

Full Content:
${content}
    `.trim();

    return await this.storeMemory({
      content: researchContent,
      metadata: {
        ...metadata,
        type: 'research',
        query,
        sources,
        summary,
      },
    });
  }

  async searchSimilarResearch(query: string, limit: number = 5): Promise<VectorSearchResult[]> {
    const searchOptions: any = { query, limit, threshold: 0.7 };
    searchOptions.type = 'research';
    return await this.searchMemory(searchOptions);
  }

  async storeConversationContext(context: {
    userMessage: string;
    agentResponse: string;
    tools_used?: string[];
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    const { userMessage, agentResponse, tools_used = [], metadata = {} } = context;

    const conversationContent = `
User: ${userMessage}

Agent: ${agentResponse}

Tools Used: ${tools_used.join(', ')}
    `.trim();

    return await this.storeMemory({
      content: conversationContent,
      metadata: {
        ...metadata,
        type: 'conversation',
        tools_used,
      },
    });
  }

  async getRecentMemories(limit: number = 10, type?: string): Promise<VectorSearchResult[]> {
    // This is a simplified implementation
    // In a real scenario, you'd want to add timestamp-based filtering to ChromaDB
    const searchOptions: any = { query: 'recent memories', limit, threshold: 0.0 };
    if (type) searchOptions.type = type;
    return await this.searchMemory(searchOptions);
  }

  async getMemoryStats(): Promise<{
    totalCount: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    try {
      const info = await this.vectorService.getCollectionInfo();
      
      // This is a simplified version
      // In a real implementation, you'd want to aggregate metadata
      return {
        totalCount: info.count,
        byType: {
          research: 0,
          conversation: 0,
          general: 0,
        },
        bySource: {
          agent: 0,
          user: 0,
          web: 0,
        },
      };
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        totalCount: 0,
        byType: {},
        bySource: {},
      };
    }
  }

  async findRelatedMemories(memoryId: string, limit: number = 5): Promise<VectorSearchResult[]> {
    try {
      return await this.vectorService.findSimilarDocuments(memoryId, {
        limit,
        threshold: 0.7,
        excludeSelf: true,
      });
    } catch (error) {
      console.error('Failed to find related memories:', error);
      return [];
    }
  }

  async summarizeMemories(memories: VectorSearchResult[], maxLength: number = 500): Promise<string> {
    if (memories.length === 0) {
      return 'No memories found.';
    }

    // Extract key content from memories
    const contentPieces = memories.map(memory => {
      const content = memory.content.length > 200 
        ? memory.content.substring(0, 200) + '...' 
        : memory.content;
      return `- ${content}`;
    });

    let summary = contentPieces.join('\n');
    
    // Truncate if too long
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength) + '...';
    }

    return summary;
  }

  async exportMemories(options: {
    type?: string;
    source?: string;
    format?: 'json' | 'text';
  } = {}): Promise<string> {
    const { type, source, format = 'json' } = options;

    try {
      // Search for memories with filters
      const searchOptions: any = { query: 'all memories', limit: 1000, threshold: 0.0 };
      if (type) searchOptions.type = type;
      if (source) searchOptions.source = source;
      const memories = await this.searchMemory(searchOptions);

      if (format === 'json') {
        return JSON.stringify(memories, null, 2);
      } else {
        // Text format
        return memories.map(memory => 
          `ID: ${memory.id}\n` +
          `Content: ${memory.content}\n` +
          `Metadata: ${JSON.stringify(memory.metadata)}\n` +
          `Similarity: ${memory.similarity}\n` +
          '---\n'
        ).join('\n');
      }
    } catch (error) {
      console.error('Failed to export memories:', error);
      throw new Error(`Failed to export memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clearMemories(options: {
    type?: string;
    source?: string;
    confirm?: boolean;
  } = {}): Promise<{ success: boolean; deletedCount: number }> {
    const { type, source, confirm = false } = options;

    if (!confirm) {
      throw new Error('Confirmation required for clearing memories');
    }

    try {
      // Search for memories to delete
      const searchOptions: any = { query: 'all memories', limit: 1000, threshold: 0.0 };
      if (type) searchOptions.type = type;
      if (source) searchOptions.source = source;
      const memories = await this.searchMemory(searchOptions);

      const ids = memories.map(memory => memory.id);
      
      if (ids.length > 0) {
        await this.vectorService.deleteDocuments(ids);
      }

      return {
        success: true,
        deletedCount: ids.length,
      };
    } catch (error) {
      console.error('Failed to clear memories:', error);
      throw new Error(`Failed to clear memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async health(): Promise<boolean> {
    try {
      return await this.vectorService.health();
    } catch {
      return false;
    }
  }

  async batchStoreMemories(input: {
    items?: Array<{
      content?: string;
      metadata?: Record<string, any>;
    }>;
  }): Promise<{ 
    results: Array<{ id: string; success: boolean; error?: string }>;
    totalSuccess: number;
    totalFailed: number;
  }> {
    const { items = [] } = input;

    if (items.length === 0) {
      throw new Error('No items provided for batch store');
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    // Process items in batches of 10 to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item) => {
                 try {
           const result = await this.storeMemory(item);
           totalSuccess++;
           return { ...result };
         } catch (error) {
           totalFailed++;
           return {
             id: '',
             success: false,
             error: error instanceof Error ? error.message : 'Unknown error',
           };
         }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return {
      results,
      totalSuccess,
      totalFailed,
    };
  }

  async batchSearchMemories(input: {
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
  }> {
    const { queries = [], limit = 10, threshold = 0.5 } = input;

    if (queries.length === 0) {
      throw new Error('No queries provided for batch search');
    }

    const results: Array<{
      query: string;
      memories: VectorSearchResult[];
      success: boolean;
      error?: string;
    }> = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    const searchPromises = queries.map(async (query) => {
             try {
         const memories = await this.searchMemory({ query, limit, threshold });
         totalSuccess++;
         return {
           query,
           memories,
           success: true,
         };
       } catch (error) {
         totalFailed++;
         return {
           query,
           memories: [],
           success: false,
           error: error instanceof Error ? error.message : 'Unknown error',
         };
       }
    });

    const searchResults = await Promise.all(searchPromises);
    results.push(...searchResults);

    return {
      results,
      totalSuccess,
      totalFailed,
    };
  }

  async batchDeleteMemories(input: {
    ids?: string[];
  }): Promise<{
    results: Array<{
      id: string;
      success: boolean;
      error?: string;
    }>;
    totalSuccess: number;
    totalFailed: number;
  }> {
    const { ids = [] } = input;

    if (ids.length === 0) {
      throw new Error('No IDs provided for batch delete');
    }

    const results: Array<{
      id: string;
      success: boolean;
      error?: string;
    }> = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    // Process deletions in batches
    const batchSize = 20;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      
      const deletePromises = batch.map(async (id) => {
                 try {
           await this.deleteMemory({ id });
           totalSuccess++;
           return {
             id,
             success: true,
           };
         } catch (error) {
           totalFailed++;
           return {
             id,
             success: false,
             error: error instanceof Error ? error.message : 'Unknown error',
           };
         }
      });

      const batchResults = await Promise.all(deletePromises);
      results.push(...batchResults);
    }

    return {
      results,
      totalSuccess,
      totalFailed,
    };
  }

  async bulkImportMemories(data: Array<{
    content: string;
    metadata?: Record<string, any>;
  }>): Promise<{
    imported: number;
    failed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;

    // Validate data first
    const validItems = data.filter(item => {
      if (!item.content || typeof item.content !== 'string') {
        errors.push('Invalid content in import data');
        failed++;
        return false;
      }
      return true;
    });

    if (validItems.length === 0) {
      return { imported: 0, failed: data.length, errors };
    }

    try {
      const result = await this.batchStoreMemories({ items: validItems });
      imported = result.totalSuccess;
      failed += result.totalFailed;
      
      result.results.forEach(r => {
        if (r.error) {
          errors.push(r.error);
        }
      });

      return { imported, failed, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return { imported: 0, failed: data.length, errors };
    }
  }

  async optimizeMemoryStorage(): Promise<{
    duplicatesRemoved: number;
    orphansRemoved: number;
    totalOptimized: number;
  }> {
    try {
      // This is a simplified implementation
      // In a real scenario, you'd implement duplicate detection and cleanup
      
      // For now, just return stats
      return {
        duplicatesRemoved: 0,
        orphansRemoved: 0,
        totalOptimized: 0,
      };
    } catch (error) {
      console.error('Failed to optimize memory storage:', error);
      throw new Error(`Memory optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMemoryInsights(): Promise<{
    totalMemories: number;
    averageContentLength: number;
    mostCommonTypes: Array<{ type: string; count: number }>;
    recentActivity: Array<{ date: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
  }> {
    try {
      const stats = await this.getMemoryStats();
      
      // This is a simplified implementation
      // In a real scenario, you'd aggregate more detailed statistics
      return {
        totalMemories: stats.totalCount,
        averageContentLength: 0, // Would calculate from actual data
        mostCommonTypes: Object.entries(stats.byType).map(([type, count]) => ({ type, count })),
        recentActivity: [], // Would calculate from timestamps
        topSources: Object.entries(stats.bySource).map(([source, count]) => ({ source, count })),
      };
    } catch (error) {
      console.error('Failed to get memory insights:', error);
      throw new Error(`Memory insights failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchMemoriesWithFilters(filters: {
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
  }): Promise<VectorSearchResult[]> {
    const { 
      query = 'search memories', 
      types = [], 
      sources = [], 
      dateRange, 
      contentLength, 
      limit = 10, 
      threshold = 0.5 
    } = filters;

    try {
      // Get base search results
      let results = await this.searchMemory({ query, limit: limit * 2, threshold });

      // Apply filters
      if (types.length > 0) {
        results = results.filter(r => 
          r.metadata?.type && types.includes(r.metadata.type)
        );
      }

      if (sources.length > 0) {
        results = results.filter(r => 
          r.metadata?.source && sources.includes(r.metadata.source)
        );
      }

      if (dateRange) {
        results = results.filter(r => {
          const timestamp = r.metadata?.timestamp;
          if (!timestamp) return false;
          const date = new Date(timestamp);
          return date >= dateRange.start && date <= dateRange.end;
        });
      }

      if (contentLength) {
        results = results.filter(r => {
          const length = r.content.length;
          if (contentLength.min && length < contentLength.min) return false;
          if (contentLength.max && length > contentLength.max) return false;
          return true;
        });
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error('Failed to search memories with filters:', error);
      throw new Error(`Filtered search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 