"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryTool = void 0;
const uuid_1 = require("uuid");
class MemoryTool {
    constructor(vectorService, embeddingService) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'memory'
        });
        Object.defineProperty(this, "description", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Store and retrieve information from the agent\'s long-term memory using vector search'
        });
        Object.defineProperty(this, "vectorService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "embeddingService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.vectorService = vectorService;
        this.embeddingService = embeddingService;
    }
    async execute(input) {
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
        }
        catch (error) {
            console.error('Memory tool error:', error);
            throw new Error(`Memory operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async storeMemory(input) {
        const { content, metadata = {} } = input;
        if (!content) {
            throw new Error('Content is required for storing memory');
        }
        try {
            const embedding = await this.embeddingService.generateEmbedding(content);
            const memoryChunk = {
                id: (0, uuid_1.v4)(),
                content,
                embedding,
                metadata: {
                    ...metadata,
                    timestamp: new Date(),
                    source: metadata.source || 'agent',
                    type: metadata.type || 'general',
                },
            };
            await this.vectorService.addDocument(memoryChunk);
            return {
                id: memoryChunk.id,
                success: true,
            };
        }
        catch (error) {
            console.error('Failed to store memory:', error);
            throw new Error(`Failed to store memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async searchMemory(input) {
        const { query, limit = 10, threshold = 0.5, source, type } = input;
        if (!query) {
            throw new Error('Query is required for searching memory');
        }
        try {
            const queryEmbedding = await this.embeddingService.generateEmbedding(query);
            const searchOptions = { limit, threshold };
            if (source)
                searchOptions.source = source;
            if (type)
                searchOptions.type = type;
            const results = await this.vectorService.searchByText(query, queryEmbedding, searchOptions);
            return results;
        }
        catch (error) {
            console.error('Failed to search memory:', error);
            throw new Error(`Failed to search memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async retrieveMemory(input) {
        const { id } = input;
        if (!id) {
            throw new Error('ID is required for retrieving memory');
        }
        try {
            return await this.vectorService.getDocument(id);
        }
        catch (error) {
            console.error('Failed to retrieve memory:', error);
            throw new Error(`Failed to retrieve memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async updateMemory(input) {
        const { id, content, metadata } = input;
        if (!id) {
            throw new Error('ID is required for updating memory');
        }
        try {
            const updates = {};
            if (content) {
                updates.content = content;
                updates.embedding = await this.embeddingService.generateEmbedding(content);
            }
            if (metadata) {
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
        }
        catch (error) {
            console.error('Failed to update memory:', error);
            throw new Error(`Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async deleteMemory(input) {
        const { id } = input;
        if (!id) {
            throw new Error('ID is required for deleting memory');
        }
        try {
            await this.vectorService.deleteDocument(id);
            return { success: true };
        }
        catch (error) {
            console.error('Failed to delete memory:', error);
            throw new Error(`Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async storeResearchFindings(findings) {
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
    async searchSimilarResearch(query, limit = 5) {
        const searchOptions = { query, limit, threshold: 0.7 };
        searchOptions.type = 'research';
        return await this.searchMemory(searchOptions);
    }
    async storeConversationContext(context) {
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
    async getRecentMemories(limit = 10, type) {
        const searchOptions = { query: 'recent memories', limit, threshold: 0.0 };
        if (type)
            searchOptions.type = type;
        return await this.searchMemory(searchOptions);
    }
    async getMemoryStats() {
        try {
            const info = await this.vectorService.getCollectionInfo();
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
        }
        catch (error) {
            console.error('Failed to get memory stats:', error);
            return {
                totalCount: 0,
                byType: {},
                bySource: {},
            };
        }
    }
    async findRelatedMemories(memoryId, limit = 5) {
        try {
            return await this.vectorService.findSimilarDocuments(memoryId, {
                limit,
                threshold: 0.7,
                excludeSelf: true,
            });
        }
        catch (error) {
            console.error('Failed to find related memories:', error);
            return [];
        }
    }
    async summarizeMemories(memories, maxLength = 500) {
        if (memories.length === 0) {
            return 'No memories found.';
        }
        const contentPieces = memories.map(memory => {
            const content = memory.content.length > 200
                ? memory.content.substring(0, 200) + '...'
                : memory.content;
            return `- ${content}`;
        });
        let summary = contentPieces.join('\n');
        if (summary.length > maxLength) {
            summary = summary.substring(0, maxLength) + '...';
        }
        return summary;
    }
    async exportMemories(options = {}) {
        const { type, source, format = 'json' } = options;
        try {
            const searchOptions = { query: 'all memories', limit: 1000, threshold: 0.0 };
            if (type)
                searchOptions.type = type;
            if (source)
                searchOptions.source = source;
            const memories = await this.searchMemory(searchOptions);
            if (format === 'json') {
                return JSON.stringify(memories, null, 2);
            }
            else {
                return memories.map(memory => `ID: ${memory.id}\n` +
                    `Content: ${memory.content}\n` +
                    `Metadata: ${JSON.stringify(memory.metadata)}\n` +
                    `Similarity: ${memory.similarity}\n` +
                    '---\n').join('\n');
            }
        }
        catch (error) {
            console.error('Failed to export memories:', error);
            throw new Error(`Failed to export memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async clearMemories(options = {}) {
        const { type, source, confirm = false } = options;
        if (!confirm) {
            throw new Error('Confirmation required for clearing memories');
        }
        try {
            const searchOptions = { query: 'all memories', limit: 1000, threshold: 0.0 };
            if (type)
                searchOptions.type = type;
            if (source)
                searchOptions.source = source;
            const memories = await this.searchMemory(searchOptions);
            const ids = memories.map(memory => memory.id);
            if (ids.length > 0) {
                await this.vectorService.deleteDocuments(ids);
            }
            return {
                success: true,
                deletedCount: ids.length,
            };
        }
        catch (error) {
            console.error('Failed to clear memories:', error);
            throw new Error(`Failed to clear memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async health() {
        try {
            return await this.vectorService.health();
        }
        catch {
            return false;
        }
    }
    async batchStoreMemories(input) {
        const { items = [] } = input;
        if (items.length === 0) {
            throw new Error('No items provided for batch store');
        }
        const results = [];
        let totalSuccess = 0;
        let totalFailed = 0;
        const batchSize = 10;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                try {
                    const result = await this.storeMemory(item);
                    totalSuccess++;
                    return { ...result };
                }
                catch (error) {
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
    async batchSearchMemories(input) {
        const { queries = [], limit = 10, threshold = 0.5 } = input;
        if (queries.length === 0) {
            throw new Error('No queries provided for batch search');
        }
        const results = [];
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
            }
            catch (error) {
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
    async batchDeleteMemories(input) {
        const { ids = [] } = input;
        if (ids.length === 0) {
            throw new Error('No IDs provided for batch delete');
        }
        const results = [];
        let totalSuccess = 0;
        let totalFailed = 0;
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
                }
                catch (error) {
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
    async bulkImportMemories(data) {
        const errors = [];
        let imported = 0;
        let failed = 0;
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
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown error');
            return { imported: 0, failed: data.length, errors };
        }
    }
    async optimizeMemoryStorage() {
        try {
            return {
                duplicatesRemoved: 0,
                orphansRemoved: 0,
                totalOptimized: 0,
            };
        }
        catch (error) {
            console.error('Failed to optimize memory storage:', error);
            throw new Error(`Memory optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getMemoryInsights() {
        try {
            const stats = await this.getMemoryStats();
            return {
                totalMemories: stats.totalCount,
                averageContentLength: 0,
                mostCommonTypes: Object.entries(stats.byType).map(([type, count]) => ({ type, count })),
                recentActivity: [],
                topSources: Object.entries(stats.bySource).map(([source, count]) => ({ source, count })),
            };
        }
        catch (error) {
            console.error('Failed to get memory insights:', error);
            throw new Error(`Memory insights failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async searchMemoriesWithFilters(filters) {
        const { query = 'search memories', types = [], sources = [], dateRange, contentLength, limit = 10, threshold = 0.5 } = filters;
        try {
            let results = await this.searchMemory({ query, limit: limit * 2, threshold });
            if (types.length > 0) {
                results = results.filter(r => r.metadata?.type && types.includes(r.metadata.type));
            }
            if (sources.length > 0) {
                results = results.filter(r => r.metadata?.source && sources.includes(r.metadata.source));
            }
            if (dateRange) {
                results = results.filter(r => {
                    const timestamp = r.metadata?.timestamp;
                    if (!timestamp)
                        return false;
                    const date = new Date(timestamp);
                    return date >= dateRange.start && date <= dateRange.end;
                });
            }
            if (contentLength) {
                results = results.filter(r => {
                    const length = r.content.length;
                    if (contentLength.min && length < contentLength.min)
                        return false;
                    if (contentLength.max && length > contentLength.max)
                        return false;
                    return true;
                });
            }
            return results.slice(0, limit);
        }
        catch (error) {
            console.error('Failed to search memories with filters:', error);
            throw new Error(`Filtered search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
exports.MemoryTool = MemoryTool;
//# sourceMappingURL=MemoryTool.js.map