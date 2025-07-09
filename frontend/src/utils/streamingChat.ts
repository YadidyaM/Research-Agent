// Streaming Chat Utilities
import { API_CONFIG } from '../config/api';

export interface StreamingMessage {
  id: string;
  type: 'user_message' | 'assistant_message' | 'error' | 'end';
  data: any;
  conversationId?: string;
}

export interface ConversationSettings {
  customSystemPrompt?: string;
  contextWindow?: number;
  maxTokensPerResponse?: number;
  temperature?: number;
  model?: string;
  provider?: string;
  enableContextOptimization?: boolean;
  enableAutoSummary?: boolean;
}

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
  settings: ConversationSettings;
  metadata: {
    messageCount: number;
    totalTokens: number;
    averageResponseTime: number;
    topics: string[];
    entities: string[];
  };
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt?: Date;
  tokens?: number;
  processingTime?: number;
  isEdited: boolean;
  metadata: {
    importance: string;
    keywords: string[];
    entities: string[];
    flags: string[];
  };
}

export class StreamingChatService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_CONFIG.getBaseUrl();
  }

  // Streaming chat with Server-Sent Events
  async streamChat(
    message: string,
    conversationId?: string,
    settings?: ConversationSettings,
    onMessage?: (message: StreamingMessage) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversationId,
        settings
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Streaming failed: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            try {
              const parsed: StreamingMessage = JSON.parse(data);
              
              if (parsed.type === 'error') {
                if (onError) {
                  onError(new Error(parsed.data.details || 'Unknown error'));
                }
                return;
              }
              
              if (parsed.type === 'end') {
                if (onComplete) {
                  onComplete();
                }
                return;
              }
              
              if (onMessage) {
                onMessage(parsed);
              }
            } catch (error) {
              console.warn('Failed to parse streaming message:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Conversation Management
  async createConversation(data: {
    name: string;
    description?: string;
    tags?: string[];
    settings?: ConversationSettings;
  }): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.statusText}`);
    }

    return response.json();
  }

  async getConversations(params: {
    query?: string;
    tags?: string[];
    archived?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<{
    conversations: Conversation[];
    total: number;
    facets: any;
  }> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    const response = await fetch(`${this.baseUrl}/api/conversations?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get conversations: ${response.statusText}`);
    }

    return response.json();
  }

  async getRecentConversations(limit: number = 10): Promise<Conversation[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations/recent?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get recent conversations: ${response.statusText}`);
    }

    return response.json();
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get conversation: ${response.statusText}`);
    }

    return response.json();
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update conversation: ${response.statusText}`);
    }

    return response.json();
  }

  async deleteConversation(id: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete conversation: ${response.statusText}`);
    }

    const result = await response.json();
    return result.success;
  }

  async archiveConversation(id: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}/archive`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to archive conversation: ${response.statusText}`);
    }

    const result = await response.json();
    return result.success;
  }

  async restoreConversation(id: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}/restore`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to restore conversation: ${response.statusText}`);
    }

    const result = await response.json();
    return result.success;
  }

  // Message Management
  async getMessages(conversationId: string, options: {
    limit?: number;
    offset?: number;
    includeMetadata?: boolean;
  } = {}): Promise<ConversationMessage[]> {
    const searchParams = new URLSearchParams();
    
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });

    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/messages?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }

    return response.json();
  }

  async addMessage(conversationId: string, message: {
    role: string;
    content: string;
    type?: string;
    metadata?: any;
  }): Promise<ConversationMessage> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to add message: ${response.statusText}`);
    }

    return response.json();
  }

  async searchMessages(conversationId: string, query: string): Promise<ConversationMessage[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/messages/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to search messages: ${response.statusText}`);
    }

    return response.json();
  }

  // Context Management
  async addContext(conversationId: string, context: {
    type: string;
    content: any;
    priority?: number;
    expiresAt?: Date;
    metadata?: any;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      throw new Error(`Failed to add context: ${response.statusText}`);
    }

    return response.json();
  }

  async getContext(conversationId: string, type?: string): Promise<any[]> {
    const url = type 
      ? `${this.baseUrl}/api/conversations/${conversationId}/context?type=${type}`
      : `${this.baseUrl}/api/conversations/${conversationId}/context`;
      
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get context: ${response.statusText}`);
    }

    return response.json();
  }

  async optimizeContext(conversationId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/context/optimize`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to optimize context: ${response.statusText}`);
    }

    return response.json();
  }

  // Conversation Branching
  async createBranch(conversationId: string, data: {
    messageIndex: number;
    name: string;
    description?: string;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/branch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create branch: ${response.statusText}`);
    }

    return response.json();
  }

  async getBranches(conversationId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/branches`);
    
    if (!response.ok) {
      throw new Error(`Failed to get branches: ${response.statusText}`);
    }

    return response.json();
  }

  async switchToBranch(branchId: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/api/conversations/branches/${branchId}/switch`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to switch branch: ${response.statusText}`);
    }

    return response.json();
  }

  // Export Functionality
  async exportConversations(data: {
    conversationIds: string[];
    format?: string;
    includeMetadata?: boolean;
    includeAttachments?: boolean;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/conversations/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to export conversations: ${response.statusText}`);
    }

    return response.json();
  }

  async getExportStatus(exportId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/exports/${exportId}/status`);
    
    if (!response.ok) {
      throw new Error(`Failed to get export status: ${response.statusText}`);
    }

    return response.json();
  }

  async downloadExport(exportId: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/exports/${exportId}/download`);
    
    if (!response.ok) {
      throw new Error(`Failed to download export: ${response.statusText}`);
    }

    return response.blob();
  }

  // Settings Management
  async getConversationSettings(conversationId: string): Promise<ConversationSettings> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/settings`);
    
    if (!response.ok) {
      throw new Error(`Failed to get conversation settings: ${response.statusText}`);
    }

    return response.json();
  }

  async updateConversationSettings(conversationId: string, settings: Partial<ConversationSettings>): Promise<ConversationSettings> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Failed to update conversation settings: ${response.statusText}`);
    }

    return response.json();
  }

  // Analytics
  async getConversationAnalytics(conversationId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/analytics`);
    
    if (!response.ok) {
      throw new Error(`Failed to get conversation analytics: ${response.statusText}`);
    }

    return response.json();
  }

  async getUserAnalytics(userId: string, dateRange?: { start: Date; end: Date }): Promise<any> {
    let url = `${this.baseUrl}/api/users/${userId}/analytics`;
    
    if (dateRange) {
      const params = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });
      url += `?${params}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get user analytics: ${response.statusText}`);
    }

    return response.json();
  }
} 