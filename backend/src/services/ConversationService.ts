import { v4 as uuidv4 } from 'uuid';
import {
  Conversation,
  ConversationMessage,
  ConversationSearchQuery,
  ConversationSearchResult,
  ExportOptions,
  ExportResult,
  ConversationBranch,
  ConversationContext,
  ConversationAnalytics,
  ConversationSettings,
  MessageType,
  ContextType,
  ConversationMetadata,
  MessageMetadata,
  MessageStatus
} from '../types/conversation';
import {
  IConversationService,
  CreateConversationData,
  CreateMessageData,
  GetMessagesOptions,
  CreateContextData,
  CreateBranchData
} from '../interfaces/services/IConversationService';
import { ILLMService } from '../interfaces/services/ILLMService';

// Mock database - replace with actual database implementation
interface ConversationDatabase {
  conversations: Map<string, Conversation>;
  messages: Map<string, ConversationMessage>;
  contexts: Map<string, ConversationContext>;
  branches: Map<string, ConversationBranch>;
  exports: Map<string, ExportResult>;
}

export class ConversationService implements IConversationService {
  private db: ConversationDatabase;
  private llmService: ILLMService;

  constructor(llmService: ILLMService) {
    this.llmService = llmService;
    this.db = {
      conversations: new Map(),
      messages: new Map(),
      contexts: new Map(),
      branches: new Map(),
      exports: new Map()
    };
  }

  // Core conversation management
  async createConversation(data: CreateConversationData): Promise<Conversation> {
    const now = new Date();
    const conversation: Conversation = {
      id: uuidv4(),
      name: data.name,
      description: data.description,
      userId: data.userId,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      tags: data.tags || [],
      metadata: {
        messageCount: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        topics: [],
        entities: []
      },
      settings: {
        contextWindow: 4096,
        maxTokensPerResponse: 1000,
        temperature: 0.7,
        enableContextOptimization: true,
        enableAutoSummary: false,
        retentionPolicy: {
          type: 'time',
          value: 90,
          autoArchive: false
        },
        ...data.settings
      },
      parentConversationId: data.parentConversationId,
      branchPoint: data.branchPoint
    };

    this.db.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async getConversation(id: string, userId: string): Promise<Conversation | null> {
    const conversation = this.db.conversations.get(id);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return conversation;
  }

  async updateConversation(id: string, userId: string, updates: Partial<Conversation>): Promise<Conversation> {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const updatedConversation = {
      ...conversation,
      ...updates,
      updatedAt: new Date()
    };

    this.db.conversations.set(id, updatedConversation);
    return updatedConversation;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) {
      return false;
    }

    // Delete all related messages and contexts
    for (const [messageId, message] of this.db.messages) {
      if (message.conversationId === id) {
        this.db.messages.delete(messageId);
      }
    }

    for (const [contextId, context] of this.db.contexts) {
      if (context.conversationId === id) {
        this.db.contexts.delete(contextId);
      }
    }

    this.db.conversations.delete(id);
    return true;
  }

  async archiveConversation(id: string, userId: string): Promise<boolean> {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) {
      return false;
    }

    conversation.isArchived = true;
    conversation.updatedAt = new Date();
    this.db.conversations.set(id, conversation);
    return true;
  }

  async restoreConversation(id: string, userId: string): Promise<boolean> {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) {
      return false;
    }

    conversation.isArchived = false;
    conversation.updatedAt = new Date();
    this.db.conversations.set(id, conversation);
    return true;
  }

  // Message management
  async addMessage(conversationId: string, messageData: CreateMessageData): Promise<ConversationMessage> {
    const conversation = this.db.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const now = new Date();
    const message: ConversationMessage = {
      id: uuidv4(),
      conversationId,
      role: messageData.role,
      content: messageData.content,
      type: messageData.type || 'user',
      status: 'completed',
      createdAt: now,
      timestamp: now,
      metadata: {
        importance: 'medium',
        keywords: [],
        entities: [],
        flags: [],
        ...messageData.metadata
      },
      isEdited: false,
      parentMessageId: messageData.parentMessageId
    };

    // Update conversation metadata
    conversation.metadata.messageCount++;
    conversation.lastMessageAt = now;
    conversation.updatedAt = now;

    this.db.messages.set(message.id, message);
    this.db.conversations.set(conversationId, conversation);

    return message;
  }

  async getMessage(messageId: string, userId: string): Promise<ConversationMessage | null> {
    const message = this.db.messages.get(messageId);
    if (!message) {
      return null;
    }

    const conversation = this.db.conversations.get(message.conversationId);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }

    return message;
  }

  async updateMessage(messageId: string, userId: string, updates: Partial<ConversationMessage>): Promise<ConversationMessage> {
    const message = await this.getMessage(messageId, userId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (updates.content && updates.content !== message.content) {
      message.editHistory = message.editHistory || [];
      message.editHistory.push({
        timestamp: new Date(),
        previousContent: message.content
      });
      message.isEdited = true;
    }

    const updatedMessage = {
      ...message,
      ...updates,
      updatedAt: new Date()
    };

    this.db.messages.set(messageId, updatedMessage);
    return updatedMessage;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await this.getMessage(messageId, userId);
    if (!message) {
      return false;
    }

    this.db.messages.delete(messageId);

    // Update conversation message count
    const conversation = this.db.conversations.get(message.conversationId);
    if (conversation) {
      conversation.metadata.messageCount--;
      this.db.conversations.set(message.conversationId, conversation);
    }

    return true;
  }

  async getMessages(conversationId: string, userId: string, options: GetMessagesOptions = {}): Promise<ConversationMessage[]> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    let messages = Array.from(this.db.messages.values())
      .filter(message => message.conversationId === conversationId);

    // Apply filters
    if (options.messageTypes) {
      messages = messages.filter(message => options.messageTypes!.includes(message.type));
    }

    if (options.startDate) {
      messages = messages.filter(message => message.createdAt >= options.startDate!);
    }

    if (options.endDate) {
      messages = messages.filter(message => message.createdAt <= options.endDate!);
    }

    // Sort by creation date
    messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Apply pagination
    if (options.offset) {
      messages = messages.slice(options.offset);
    }

    if (options.limit) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  // Search and discovery
  async searchConversations(query: ConversationSearchQuery): Promise<ConversationSearchResult> {
    let conversations = Array.from(this.db.conversations.values());

    // Apply filters
    if (query.userId) {
      conversations = conversations.filter(c => c.userId === query.userId);
    }

    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      conversations = conversations.filter(c => 
        c.name.toLowerCase().includes(searchTerm) ||
        (c.description && c.description.toLowerCase().includes(searchTerm)) ||
        c.metadata.topics.some(topic => topic.toLowerCase().includes(searchTerm))
      );
    }

    if (query.tags && query.tags.length > 0) {
      conversations = conversations.filter(c => 
        query.tags!.some(tag => c.tags.includes(tag))
      );
    }

    if (query.isArchived !== undefined) {
      conversations = conversations.filter(c => c.isArchived === query.isArchived);
    }

    if (query.dateRange) {
      conversations = conversations.filter(c => 
        c.createdAt >= query.dateRange!.start && 
        c.createdAt <= query.dateRange!.end
      );
    }

    // Sort
    const sortBy = query.sortBy || 'updated_at';
    const sortOrder = query.sortOrder || 'desc';
    
    conversations.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'created_at':
          aValue = a.createdAt.getTime();
          bValue = b.createdAt.getTime();
          break;
        case 'updated_at':
          aValue = a.updatedAt.getTime();
          bValue = b.updatedAt.getTime();
          break;
        case 'last_message_at':
          aValue = a.lastMessageAt?.getTime() || 0;
          bValue = b.lastMessageAt?.getTime() || 0;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    const total = conversations.length;

    // Apply pagination
    if (query.offset) {
      conversations = conversations.slice(query.offset);
    }

    if (query.limit) {
      conversations = conversations.slice(0, query.limit);
    }

    // Build facets
    const allConversations = Array.from(this.db.conversations.values());
    const facets = {
      tags: {},
      topics: {},
      messageTypes: {},
      dateRanges: {}
    };

    return {
      conversations,
      total,
      facets
    };
  }

  async searchMessages(conversationId: string, query: string, userId: string): Promise<ConversationMessage[]> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const searchTerm = query.toLowerCase();
    const messages = Array.from(this.db.messages.values())
      .filter(message => 
        message.conversationId === conversationId &&
        message.content.toLowerCase().includes(searchTerm)
      );

    return messages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentConversations(userId: string, limit: number = 10): Promise<Conversation[]> {
    const conversations = Array.from(this.db.conversations.values())
      .filter(c => c.userId === userId && !c.isArchived)
      .sort((a, b) => (b.lastMessageAt || b.updatedAt).getTime() - (a.lastMessageAt || a.updatedAt).getTime())
      .slice(0, limit);

    return conversations;
  }

  async getConversationsByTag(tag: string, userId: string): Promise<Conversation[]> {
    return Array.from(this.db.conversations.values())
      .filter(c => c.userId === userId && c.tags.includes(tag))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // Context management
  async addContext(conversationId: string, contextData: CreateContextData): Promise<ConversationContext> {
    const conversation = this.db.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const now = new Date();
    const context: ConversationContext = {
      id: uuidv4(),
      conversationId,
      type: contextData.type,
      content: contextData.content,
      priority: contextData.priority || 1,
      createdAt: now,
      expiresAt: contextData.expiresAt,
      isActive: true,
      metadata: {
        source: 'manual',
        relevanceScore: 1.0,
        lastUsed: now,
        useCount: 0,
        tags: [],
        ...contextData.metadata
      }
    };

    this.db.contexts.set(context.id, context);
    return context;
  }

  async getContext(conversationId: string, type?: ContextType): Promise<ConversationContext[]> {
    let contexts = Array.from(this.db.contexts.values())
      .filter(context => context.conversationId === conversationId && context.isActive);

    if (type) {
      contexts = contexts.filter(context => context.type === type);
    }

    // Remove expired contexts
    const now = new Date();
    contexts = contexts.filter(context => !context.expiresAt || context.expiresAt > now);

    return contexts.sort((a, b) => b.priority - a.priority);
  }

  async updateContext(contextId: string, updates: Partial<ConversationContext>): Promise<ConversationContext> {
    const context = this.db.contexts.get(contextId);
    if (!context) {
      throw new Error('Context not found');
    }

    const updatedContext = {
      ...context,
      ...updates
    };

    this.db.contexts.set(contextId, updatedContext);
    return updatedContext;
  }

  async removeContext(contextId: string): Promise<boolean> {
    return this.db.contexts.delete(contextId);
  }

  async optimizeContext(conversationId: string): Promise<ConversationContext[]> {
    const contexts = await this.getContext(conversationId);
    
    // Simple optimization: remove low-priority unused contexts
    const optimizedContexts = contexts.filter(context => 
      context.priority > 1 || context.metadata.useCount > 0
    );

    // Deactivate removed contexts
    for (const context of contexts) {
      if (!optimizedContexts.includes(context)) {
        await this.updateContext(context.id, { isActive: false });
      }
    }

    return optimizedContexts;
  }

  // Conversation branching
  async createBranch(conversationId: string, messageIndex: number, data: CreateBranchData): Promise<ConversationBranch> {
    const conversation = this.db.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const branch: ConversationBranch = {
      id: uuidv4(),
      parentConversationId: conversationId,
      branchPoint: messageIndex,
      name: data.name,
      description: data.description,
      createdAt: new Date(),
      createdBy: data.createdBy,
      isActive: true
    };

    this.db.branches.set(branch.id, branch);
    return branch;
  }

  async getBranches(conversationId: string): Promise<ConversationBranch[]> {
    return Array.from(this.db.branches.values())
      .filter(branch => branch.parentConversationId === conversationId && branch.isActive)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async switchToBranch(branchId: string, userId: string): Promise<Conversation> {
    const branch = this.db.branches.get(branchId);
    if (!branch) {
      throw new Error('Branch not found');
    }

    const parentConversation = await this.getConversation(branch.parentConversationId, userId);
    if (!parentConversation) {
      throw new Error('Parent conversation not found');
    }

    // Create new conversation from branch
    const branchedConversation = await this.createConversation({
      name: `${parentConversation.name} - ${branch.name}`,
      description: branch.description,
      userId,
      tags: parentConversation.tags,
      settings: parentConversation.settings,
      parentConversationId: branch.parentConversationId,
      branchPoint: branch.branchPoint
    });

    // Copy messages up to branch point
    const parentMessages = await this.getMessages(branch.parentConversationId, userId);
    const messagesToCopy = parentMessages.slice(0, branch.branchPoint);

    for (const message of messagesToCopy) {
      await this.addMessage(branchedConversation.id, {
        role: message.role,
        content: message.content,
        type: message.type,
        metadata: message.metadata
      });
    }

    return branchedConversation;
  }

  async mergeBranch(branchId: string, targetConversationId: string, userId: string): Promise<boolean> {
    // Implementation for merging branches would go here
    // This is complex and would require conflict resolution
    return true;
  }

  // Export functionality
  async exportConversations(options: ExportOptions, userId: string): Promise<ExportResult> {
    const exportResult: ExportResult = {
      id: uuidv4(),
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      options
    };

    this.db.exports.set(exportResult.id, exportResult);

    // Start async export process
    this.processExport(exportResult.id, userId);

    return exportResult;
  }

  async getExportStatus(exportId: string, userId: string): Promise<ExportResult> {
    const exportResult = this.db.exports.get(exportId);
    if (!exportResult) {
      throw new Error('Export not found');
    }
    return exportResult;
  }

  async downloadExport(exportId: string, userId: string): Promise<Buffer> {
    const exportResult = await this.getExportStatus(exportId, userId);
    if (exportResult.status !== 'completed') {
      throw new Error('Export not ready');
    }

    // Return mock data - implement actual file retrieval
    return Buffer.from('Export data', 'utf8');
  }

  private async processExport(exportId: string, userId: string): Promise<void> {
    try {
      const exportResult = this.db.exports.get(exportId)!;
      exportResult.status = 'processing';

      // Gather conversations
      const conversations: Conversation[] = [];
      for (const convId of exportResult.options.conversationIds) {
        const conversation = await this.getConversation(convId, userId);
        if (conversation) {
          conversations.push(conversation);
        }
      }

      // Export based on format
      let exportData: any;
      switch (exportResult.options.format) {
        case 'json':
          exportData = await this.exportToJson(conversations, exportResult.options);
          break;
        case 'markdown':
          exportData = await this.exportToMarkdown(conversations, exportResult.options);
          break;
        // Add other formats...
        default:
          throw new Error(`Unsupported export format: ${exportResult.options.format}`);
      }

      exportResult.status = 'completed';
      exportResult.downloadUrl = `/api/exports/${exportId}/download`;
      exportResult.fileSize = Buffer.byteLength(JSON.stringify(exportData));

    } catch (error) {
      const exportResult = this.db.exports.get(exportId)!;
      exportResult.status = 'failed';
      exportResult.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  private async exportToJson(conversations: Conversation[], options: ExportOptions): Promise<any> {
    const result = {
      exported_at: new Date().toISOString(),
      conversations: []
    };

    for (const conversation of conversations) {
      const messages = await this.getMessages(conversation.id, conversation.userId);
      result.conversations.push({
        ...conversation,
        messages: options.includeMetadata ? messages : messages.map(m => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt
        }))
      });
    }

    return result;
  }

  private async exportToMarkdown(conversations: Conversation[], options: ExportOptions): Promise<string> {
    let markdown = `# Conversation Export\n\nExported on: ${new Date().toISOString()}\n\n`;

    for (const conversation of conversations) {
      markdown += `## ${conversation.name}\n\n`;
      if (conversation.description) {
        markdown += `${conversation.description}\n\n`;
      }

      const messages = await this.getMessages(conversation.id, conversation.userId);
      for (const message of messages) {
        markdown += `**${message.role}**: ${message.content}\n\n`;
      }

      markdown += '---\n\n';
    }

    return markdown;
  }

  // Settings and preferences
  async updateConversationSettings(conversationId: string, settings: Partial<ConversationSettings>, userId: string): Promise<ConversationSettings> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.settings = { ...conversation.settings, ...settings };
    conversation.updatedAt = new Date();

    this.db.conversations.set(conversationId, conversation);
    return conversation.settings;
  }

  async getConversationSettings(conversationId: string, userId: string): Promise<ConversationSettings> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    return conversation.settings;
  }

  // Analytics and insights
  async getConversationAnalytics(conversationId: string, userId: string): Promise<ConversationAnalytics> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messages = await this.getMessages(conversationId, userId);
    
    return {
      conversationId,
      period: {
        start: conversation.createdAt,
        end: new Date()
      },
      metrics: {
        totalMessages: messages.length,
        averageResponseTime: conversation.metadata.averageResponseTime,
        totalTokens: conversation.metadata.totalTokens,
        topicDiversity: conversation.metadata.topics.length,
        contextSwitches: 0,
        errorRate: 0
      },
      insights: {
        dominantTopics: conversation.metadata.topics,
        conversationFlow: ['greeting', 'question', 'response'],
        userPreferences: {},
        improvementSuggestions: [],
        contextOptimizationOpportunities: []
      }
    };
  }

  async getUserAnalytics(userId: string, dateRange?: { start: Date; end: Date }): Promise<any> {
    const userConversations = Array.from(this.db.conversations.values())
      .filter(c => c.userId === userId);

    if (dateRange) {
      // Filter by date range
    }

    return {
      totalConversations: userConversations.length,
      totalMessages: userConversations.reduce((sum, c) => sum + c.metadata.messageCount, 0),
      averageConversationLength: userConversations.length > 0 
        ? userConversations.reduce((sum, c) => sum + c.metadata.messageCount, 0) / userConversations.length 
        : 0
    };
  }

  // Streaming support
  async* streamMessage(conversationId: string, messageData: CreateMessageData): AsyncGenerator<ConversationMessage, void, unknown> {
    const conversation = this.db.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Create initial message
    const message = await this.addMessage(conversationId, {
      ...messageData,
      type: 'assistant'
    });

    // Update status to processing
    message.status = 'processing';
    this.db.messages.set(message.id, message);
    yield message;

    // Simulate streaming response
    const fullResponse = await this.llmService.generateResponse(messageData.content);
    const words = fullResponse.split(' ');
    let currentContent = '';

    for (let i = 0; i < words.length; i++) {
      currentContent += (i > 0 ? ' ' : '') + words[i];
      message.content = currentContent;
      message.updatedAt = new Date();
      this.db.messages.set(message.id, message);
      yield message;
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Mark as completed
    message.status = 'completed';
    this.db.messages.set(message.id, message);
    yield message;
  }

  // Maintenance
  async cleanupExpiredContexts(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [contextId, context] of this.db.contexts) {
      if (context.expiresAt && context.expiresAt <= now) {
        this.db.contexts.delete(contextId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async summarizeOldConversations(userId: string, olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const oldConversations = Array.from(this.db.conversations.values())
      .filter(c => c.userId === userId && c.createdAt < cutoffDate && !c.isArchived);

    let summarizedCount = 0;

    for (const conversation of oldConversations) {
      // Generate summary and add as context
      const messages = await this.getMessages(conversation.id, userId);
      const messageContents = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      try {
        const summary = await this.llmService.synthesizeFindings([messageContents]);
        await this.addContext(conversation.id, {
          type: 'conversation_summary',
          content: { summary, originalMessageCount: messages.length },
          priority: 5
        });

        // Archive conversation
        await this.archiveConversation(conversation.id, userId);
        summarizedCount++;
      } catch (error) {
        console.error(`Failed to summarize conversation ${conversation.id}:`, error);
      }
    }

    return summarizedCount;
  }
} 