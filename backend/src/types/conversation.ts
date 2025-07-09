import { ChatMessage } from '../interfaces/services/ILLMService';

// Core conversation types
export interface Conversation {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  isArchived: boolean;
  tags: string[];
  metadata: ConversationMetadata;
  settings: ConversationSettings;
  parentConversationId?: string; // For conversation branching
  branchPoint?: number; // Message index where this branch started
}

export interface ConversationMetadata {
  messageCount: number;
  totalTokens: number;
  averageResponseTime: number;
  lastModel?: string;
  lastProvider?: string;
  topics: string[];
  entities: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  complexity?: 'low' | 'medium' | 'high';
}

export interface ConversationSettings {
  customSystemPrompt?: string;
  contextWindow: number;
  maxTokensPerResponse: number;
  temperature: number;
  model?: string;
  provider?: string;
  enableContextOptimization: boolean;
  enableAutoSummary: boolean;
  retentionPolicy: RetentionPolicy;
}

export interface RetentionPolicy {
  type: 'time' | 'message_count' | 'token_count' | 'manual';
  value: number;
  autoArchive: boolean;
}

// Message management
export interface ConversationMessage extends ChatMessage {
  id: string;
  conversationId: string;
  parentMessageId?: string; // For threading within conversation
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  updatedAt?: Date;
  metadata: MessageMetadata;
  tokens?: number;
  processingTime?: number;
  isEdited: boolean;
  editHistory?: MessageEdit[];
}

export type MessageType = 
  | 'user' 
  | 'assistant' 
  | 'system' 
  | 'tool_call' 
  | 'tool_response' 
  | 'summary' 
  | 'branch_point';

export type MessageStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface MessageMetadata {
  importance: 'low' | 'medium' | 'high' | 'critical';
  keywords: string[];
  entities: string[];
  intent?: string;
  confidence?: number;
  flags: string[];
  attachments?: Attachment[];
}

export interface MessageEdit {
  timestamp: Date;
  previousContent: string;
  reason?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  metadata: any;
}

// Context management
export interface ConversationContext {
  id: string;
  conversationId: string;
  type: ContextType;
  content: any;
  priority: number;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata: ContextMetadata;
}

export type ContextType = 
  | 'user_preferences' 
  | 'conversation_summary' 
  | 'tool_state' 
  | 'external_data' 
  | 'custom_instruction' 
  | 'memory_anchor';

export interface ContextMetadata {
  source: string;
  relevanceScore: number;
  lastUsed: Date;
  useCount: number;
  tags: string[];
}

// Search and filtering
export interface ConversationSearchQuery {
  query?: string;
  userId?: string;
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  messageType?: MessageType[];
  hasAttachments?: boolean;
  isArchived?: boolean;
  minTokens?: number;
  maxTokens?: number;
  sentiment?: string[];
  topics?: string[];
  sortBy?: 'created_at' | 'updated_at' | 'last_message_at' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ConversationSearchResult {
  conversations: Conversation[];
  total: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  tags: { [key: string]: number };
  topics: { [key: string]: number };
  messageTypes: { [key: string]: number };
  dateRanges: { [key: string]: number };
}

// Export functionality
export interface ExportOptions {
  conversationIds: string[];
  format: ExportFormat;
  includeMetadata: boolean;
  includeAttachments: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  messageTypes?: MessageType[];
  customFields?: string[];
}

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'pdf' | 'html';

export interface ExportResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt: Date;
  createdAt: Date;
  options: ExportOptions;
  fileSize?: number;
  error?: string;
}

// Conversation branching
export interface ConversationBranch {
  id: string;
  parentConversationId: string;
  branchPoint: number; // Message index
  name: string;
  description?: string;
  createdAt: Date;
  createdBy: string;
  isActive: boolean;
}

// Analytics and insights
export interface ConversationAnalytics {
  conversationId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: ConversationMetrics;
  insights: ConversationInsights;
}

export interface ConversationMetrics {
  totalMessages: number;
  averageResponseTime: number;
  totalTokens: number;
  userSatisfaction?: number;
  topicDiversity: number;
  contextSwitches: number;
  errorRate: number;
}

export interface ConversationInsights {
  dominantTopics: string[];
  conversationFlow: string[];
  userPreferences: { [key: string]: any };
  improvementSuggestions: string[];
  contextOptimizationOpportunities: string[];
} 