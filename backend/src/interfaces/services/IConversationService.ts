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
  ContextType
} from '../../types/conversation';

export interface IConversationService {
  // Core conversation management
  createConversation(data: CreateConversationData): Promise<Conversation>;
  getConversation(id: string, userId: string): Promise<Conversation | null>;
  updateConversation(id: string, userId: string, updates: Partial<Conversation>): Promise<Conversation>;
  deleteConversation(id: string, userId: string): Promise<boolean>;
  archiveConversation(id: string, userId: string): Promise<boolean>;
  restoreConversation(id: string, userId: string): Promise<boolean>;

  // Message management
  addMessage(conversationId: string, message: CreateMessageData): Promise<ConversationMessage>;
  getMessage(messageId: string, userId: string): Promise<ConversationMessage | null>;
  updateMessage(messageId: string, userId: string, updates: Partial<ConversationMessage>): Promise<ConversationMessage>;
  deleteMessage(messageId: string, userId: string): Promise<boolean>;
  getMessages(conversationId: string, userId: string, options?: GetMessagesOptions): Promise<ConversationMessage[]>;

  // Search and discovery
  searchConversations(query: ConversationSearchQuery): Promise<ConversationSearchResult>;
  searchMessages(conversationId: string, query: string, userId: string): Promise<ConversationMessage[]>;
  getRecentConversations(userId: string, limit?: number): Promise<Conversation[]>;
  getConversationsByTag(tag: string, userId: string): Promise<Conversation[]>;

  // Context management
  addContext(conversationId: string, context: CreateContextData): Promise<ConversationContext>;
  getContext(conversationId: string, type?: ContextType): Promise<ConversationContext[]>;
  updateContext(contextId: string, updates: Partial<ConversationContext>): Promise<ConversationContext>;
  removeContext(contextId: string): Promise<boolean>;
  optimizeContext(conversationId: string): Promise<ConversationContext[]>;

  // Conversation branching
  createBranch(conversationId: string, messageIndex: number, data: CreateBranchData): Promise<ConversationBranch>;
  getBranches(conversationId: string): Promise<ConversationBranch[]>;
  switchToBranch(branchId: string, userId: string): Promise<Conversation>;
  mergeBranch(branchId: string, targetConversationId: string, userId: string): Promise<boolean>;

  // Export functionality
  exportConversations(options: ExportOptions, userId: string): Promise<ExportResult>;
  getExportStatus(exportId: string, userId: string): Promise<ExportResult>;
  downloadExport(exportId: string, userId: string): Promise<Buffer>;

  // Settings and preferences
  updateConversationSettings(conversationId: string, settings: Partial<ConversationSettings>, userId: string): Promise<ConversationSettings>;
  getConversationSettings(conversationId: string, userId: string): Promise<ConversationSettings>;

  // Analytics and insights
  getConversationAnalytics(conversationId: string, userId: string): Promise<ConversationAnalytics>;
  getUserAnalytics(userId: string, dateRange?: { start: Date; end: Date }): Promise<any>;

  // Streaming support
  streamMessage(conversationId: string, message: CreateMessageData): AsyncGenerator<ConversationMessage, void, unknown>;

  // Maintenance
  cleanupExpiredContexts(): Promise<number>;
  summarizeOldConversations(userId: string, olderThanDays: number): Promise<number>;
}

// Helper interfaces
export interface CreateConversationData {
  name: string;
  description?: string;
  userId: string;
  tags?: string[];
  settings?: Partial<ConversationSettings>;
  parentConversationId?: string;
  branchPoint?: number;
}

export interface CreateMessageData {
  role: string;
  content: string;
  type?: MessageType;
  parentMessageId?: string;
  metadata?: any;
}

export interface GetMessagesOptions {
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
  messageTypes?: MessageType[];
  startDate?: Date;
  endDate?: Date;
}

export interface CreateContextData {
  type: ContextType;
  content: any;
  priority?: number;
  expiresAt?: Date;
  metadata?: any;
}

export interface CreateBranchData {
  name: string;
  description?: string;
  createdBy: string;
} 