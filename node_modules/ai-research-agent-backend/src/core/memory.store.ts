import { VectorService } from '../services/vector.service';
import { EmbeddingService } from '../services/embedding.service';
import { MemoryTool } from '../tools/MemoryTool';
import { MemoryChunk, VectorSearchResult } from '../types';

export class MemoryStore {
  private vectorService: VectorService;
  private embeddingService: EmbeddingService;
  private memoryTool: MemoryTool;
  private isInitialized: boolean = false;

  constructor(
    vectorService: VectorService,
    embeddingService: EmbeddingService
  ) {
    this.vectorService = vectorService;
    this.embeddingService = embeddingService;
    this.memoryTool = new MemoryTool(vectorService, embeddingService);
  }

  async initialize(): Promise<void> {
    try {
      await this.vectorService.initialize();
      this.isInitialized = true;
      console.log('Memory store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize memory store:', error);
      throw new Error(`Memory store initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Memory store not initialized. Call initialize() first.');
    }
  }

  async storeExperience(experience: {
    context: string;
    action: string;
    result: string;
    success: boolean;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    this.ensureInitialized();

    const { context, action, result, success, metadata = {} } = experience;

    const experienceContent = `
Context: ${context}
Action: ${action}
Result: ${result}
Success: ${success}
    `.trim();

    return await this.memoryTool.execute({
      action: 'store',
      content: experienceContent,
      metadata: {
        ...metadata,
        type: 'experience',
        success,
        actionType: action,
        timestamp: new Date(),
      },
    });
  }

  async storeResearchResult(research: {
    query: string;
    findings: string[];
    summary: string;
    sources: string[];
    confidence: number;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    this.ensureInitialized();

    const { query, findings, summary, sources, confidence, metadata = {} } = research;

    const researchContent = `
Research Query: ${query}
Summary: ${summary}
Confidence: ${confidence}

Key Findings:
${findings.map(finding => `- ${finding}`).join('\n')}

Sources:
${sources.map(source => `- ${source}`).join('\n')}
    `.trim();

    return await this.memoryTool.execute({
      action: 'store',
      content: researchContent,
      metadata: {
        ...metadata,
        type: 'research',
        query,
        confidence,
        sourceCount: sources.length,
        findingCount: findings.length,
        timestamp: new Date(),
      },
    });
  }

  async storeConversation(conversation: {
    userInput: string;
    agentResponse: string;
    tools_used: string[];
    success: boolean;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    this.ensureInitialized();

    const { userInput, agentResponse, tools_used, success, metadata = {} } = conversation;

    const conversationContent = `
User: ${userInput}
Agent: ${agentResponse}
Tools Used: ${tools_used.join(', ')}
Success: ${success}
    `.trim();

    return await this.memoryTool.execute({
      action: 'store',
      content: conversationContent,
      metadata: {
        ...metadata,
        type: 'conversation',
        tools_used,
        success,
        timestamp: new Date(),
      },
    });
  }

  async searchMemories(query: string, options: {
    limit?: number;
    threshold?: number;
    type?: string;
    source?: string;
  } = {}): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    return await this.memoryTool.execute({
      action: 'search',
      query,
      ...options,
    });
  }

  async getRelatedExperiences(context: string, limit: number = 5): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    return await this.searchMemories(context, {
      limit,
      threshold: 0.7,
      type: 'experience',
    });
  }

  async getSimilarResearch(query: string, limit: number = 5): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    return await this.searchMemories(query, {
      limit,
      threshold: 0.7,
      type: 'research',
    });
  }

  async getConversationHistory(query: string, limit: number = 10): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    return await this.searchMemories(query, {
      limit,
      threshold: 0.5,
      type: 'conversation',
    });
  }

  async getSuccessfulExperiences(context: string, limit: number = 5): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const experiences = await this.searchMemories(context, {
      limit: limit * 2, // Get more to filter
      threshold: 0.6,
      type: 'experience',
    });

    // Filter for successful experiences
    return experiences
      .filter(exp => exp.metadata?.success === true)
      .slice(0, limit);
  }

  async getFailedExperiences(context: string, limit: number = 5): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const experiences = await this.searchMemories(context, {
      limit: limit * 2, // Get more to filter
      threshold: 0.6,
      type: 'experience',
    });

    // Filter for failed experiences
    return experiences
      .filter(exp => exp.metadata?.success === false)
      .slice(0, limit);
  }

  async getMemoryById(id: string): Promise<MemoryChunk | null> {
    this.ensureInitialized();

    return await this.memoryTool.execute({
      action: 'retrieve',
      id,
    });
  }

  async updateMemory(id: string, updates: {
    content?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean }> {
    this.ensureInitialized();

    return await this.memoryTool.execute({
      action: 'update',
      id,
      ...updates,
    });
  }

  async deleteMemory(id: string): Promise<{ success: boolean }> {
    this.ensureInitialized();

    return await this.memoryTool.execute({
      action: 'delete',
      id,
    });
  }

  async getMemoryStats(): Promise<{
    totalCount: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    recentActivity: number;
  }> {
    this.ensureInitialized();

    const stats = await this.memoryTool.getMemoryStats();
    
    // Get recent activity (memories from last 24 hours)
    const recentMemories = await this.searchMemories('recent activity', {
      limit: 100,
      threshold: 0.0,
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentActivity = recentMemories.filter(memory => {
      const timestamp = memory.metadata?.timestamp;
      if (!timestamp) return false;
      
      const memoryDate = new Date(timestamp);
      return memoryDate >= twentyFourHoursAgo;
    }).length;

    return {
      ...stats,
      recentActivity,
    };
  }

  async generateMemorySummary(query: string): Promise<string> {
    this.ensureInitialized();

    const memories = await this.searchMemories(query, {
      limit: 10,
      threshold: 0.6,
    });

    if (memories.length === 0) {
      return `No relevant memories found for: ${query}`;
    }

    const summary = memories.map((memory, index) => {
      const content = memory.content.length > 200 
        ? memory.content.substring(0, 200) + '...' 
        : memory.content;
      
      return `${index + 1}. ${content} (Similarity: ${memory.similarity.toFixed(2)})`;
    }).join('\n\n');

    return `Memory Summary for "${query}":\n\n${summary}`;
  }

  async consolidateMemories(options: {
    similarityThreshold?: number;
    maxAge?: number; // in days
  } = {}): Promise<{
    consolidated: number;
    removed: number;
  }> {
    this.ensureInitialized();

    // This is a simplified consolidation process
    // In a real implementation, you might use more sophisticated clustering
    const { similarityThreshold = 0.95, maxAge = 30 } = options;

    const allMemories = await this.searchMemories('all memories', {
      limit: 1000,
      threshold: 0.0,
    });

    let consolidated = 0;
    let removed = 0;

    // Group similar memories
    const groups: VectorSearchResult[][] = [];
    const processed = new Set<string>();

    for (const memory of allMemories) {
      if (processed.has(memory.id)) continue;

      const similar = await this.memoryTool.findRelatedMemories(memory.id, 10);
      const highSimilarity = similar.filter(sim => sim.similarity >= similarityThreshold);

      if (highSimilarity.length > 0) {
        groups.push([memory, ...highSimilarity]);
        processed.add(memory.id);
        highSimilarity.forEach(sim => processed.add(sim.id));
      }
    }

    // Consolidate each group
    for (const group of groups) {
      if (group.length <= 1) continue;

      // Keep the most recent or highest confidence memory
      const primary = group.reduce((best, current) => {
        const bestTimestamp = new Date(best.metadata?.timestamp || 0);
        const currentTimestamp = new Date(current.metadata?.timestamp || 0);
        return currentTimestamp > bestTimestamp ? current : best;
      });

      // Delete the others
      const toDelete = group.filter(mem => mem.id !== primary.id);
      for (const mem of toDelete) {
        await this.deleteMemory(mem.id);
        removed++;
      }

      consolidated++;
    }

    return { consolidated, removed };
  }

  async exportMemories(format: 'json' | 'text' = 'json'): Promise<string> {
    this.ensureInitialized();

    return await this.memoryTool.exportMemories({ format });
  }

  async clearOldMemories(maxAge: number = 90): Promise<{ success: boolean; deletedCount: number }> {
    this.ensureInitialized();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAge);

    const allMemories = await this.searchMemories('all memories', {
      limit: 1000,
      threshold: 0.0,
    });

    const oldMemories = allMemories.filter(memory => {
      const timestamp = memory.metadata?.timestamp;
      if (!timestamp) return false;
      
      const memoryDate = new Date(timestamp);
      return memoryDate < cutoffDate;
    });

    let deletedCount = 0;
    for (const memory of oldMemories) {
      await this.deleteMemory(memory.id);
      deletedCount++;
    }

    return { success: true, deletedCount };
  }

  async health(): Promise<boolean> {
    try {
      return await this.memoryTool.health();
    } catch {
      return false;
    }
  }
} 