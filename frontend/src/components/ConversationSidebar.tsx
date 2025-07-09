import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  StreamingChatService, 
  Conversation, 
  ConversationSettings 
} from '../utils/streamingChat';

// Styled Components
const SidebarContainer = styled.div<{ show: boolean }>`
  width: ${props => props.show ? '360px' : '0'};
  background: #fafafa;
  border-right: 1px solid #e5e5e7;
  transition: width 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: inset -1px 0 3px rgba(0, 0, 0, 0.05);
  height: 100vh;
`;

const SidebarHeader = styled.div`
  padding: 20px 20px 16px 20px;
  border-bottom: 1px solid #e5e5e7;
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 10;
`;

const SidebarTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 17px;
  font-weight: 650;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
  
  &::before {
    content: "💬";
    font-size: 16px;
  }
`;

const SearchBar = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #ffffff;
  transition: border-color 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
  
  &::placeholder {
    color: #9ca3af;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
  
  &:active {
    background: #f3f4f6;
  }
`;

const SidebarContent = styled.div`
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db #f9fafb;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #f9fafb;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
`;

const ConversationList = styled.div`
  padding: 16px;
`;

const ConversationItem = styled.div<{ isActive: boolean }>`
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  
  background: ${props => props.isActive ? '#dc2626' : '#ffffff'};
  color: ${props => props.isActive ? '#ffffff' : '#374151'};
  border-color: ${props => props.isActive ? '#dc2626' : '#e5e7eb'};
  
  &:hover {
    background: ${props => props.isActive ? '#dc2626' : '#f9fafb'};
    border-color: ${props => props.isActive ? '#dc2626' : '#d1d5db'};
  }
`;

const ConversationHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
`;

const ConversationName = styled.div`
  font-weight: 600;
  font-size: 14px;
  line-height: 1.3;
  flex: 1;
  margin-right: 8px;
`;

const ConversationTime = styled.div`
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
`;

const ConversationPreview = styled.div`
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ConversationMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
`;

const MetaTag = styled.span`
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
`;

const ConversationActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 8px;
`;

const MiniActionButton = styled.button`
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const LoadingIndicator = styled.div`
  padding: 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
`;

const EmptyState = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
`;

const EmptyStateIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const EmptyStateText = styled.div`
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
`;

const EmptyStateSubtext = styled.div`
  font-size: 14px;
  opacity: 0.7;
`;

const FilterTabs = styled.div`
  display: flex;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
  margin-bottom: 16px;
`;

const FilterTab = styled.button<{ active: boolean }>`
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  background: ${props => props.active ? '#ffffff' : 'transparent'};
  color: ${props => props.active ? '#dc2626' : '#6b7280'};
  box-shadow: ${props => props.active ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none'};
`;

// Component Interface
interface ConversationSidebarProps {
  show: boolean;
  streamingService: StreamingChatService;
  currentConversationId?: string;
  onConversationSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onConversationUpdate: (conversation: Conversation) => void;
}

// Filter types
type FilterType = 'all' | 'recent' | 'archived' | 'favorites';

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  show,
  streamingService,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onConversationUpdate
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [error, setError] = useState<string | null>(null);

  // Load conversations
  useEffect(() => {
    if (show) {
      loadConversations();
    }
  }, [show]);

  // Filter conversations when search or filter changes
  useEffect(() => {
    filterConversations();
  }, [conversations, searchQuery, activeFilter]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await streamingService.getConversations({
        limit: 100,
        sortBy: 'updated_at',
        sortOrder: 'desc'
      });
      
      setConversations(result.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterConversations = () => {
    let filtered = [...conversations];

    // Apply filter type
    switch (activeFilter) {
      case 'recent':
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        filtered = filtered.filter(conv => 
          new Date(conv.updatedAt) > oneDayAgo
        );
        break;
      case 'archived':
        filtered = filtered.filter(conv => conv.isArchived);
        break;
      case 'favorites':
        filtered = filtered.filter(conv => 
          conv.tags.includes('favorite')
        );
        break;
      case 'all':
      default:
        filtered = filtered.filter(conv => !conv.isArchived);
        break;
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.name.toLowerCase().includes(query) ||
        (conv.description && conv.description.toLowerCase().includes(query)) ||
        conv.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredConversations(filtered);
  };

  const handleCreateNew = async () => {
    try {
      const newConversation = await streamingService.createConversation({
        name: `New Chat ${new Date().toLocaleString()}`,
        tags: []
      });
      
      setConversations(prev => [newConversation, ...prev]);
      onNewConversation();
      onConversationSelect(newConversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  };

  const handleArchiveConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await streamingService.archiveConversation(conversationId);
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, isArchived: true }
            : conv
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive conversation');
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    
    try {
      await streamingService.deleteConversation(conversationId);
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays < 7) {
      return `${diffDays}d`;
    } else {
      return d.toLocaleDateString();
    }
  };

  const getPreviewText = (conversation: Conversation) => {
    if (conversation.description) {
      return conversation.description;
    }
    return `${conversation.metadata.messageCount} messages`;
  };

  return (
    <SidebarContainer show={show}>
      <SidebarHeader>
        <SidebarTitle>Conversations</SidebarTitle>
        
        <SearchBar
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <FilterTabs>
          <FilterTab
            active={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
          >
            All
          </FilterTab>
          <FilterTab
            active={activeFilter === 'recent'}
            onClick={() => setActiveFilter('recent')}
          >
            Recent
          </FilterTab>
          <FilterTab
            active={activeFilter === 'archived'}
            onClick={() => setActiveFilter('archived')}
          >
            Archived
          </FilterTab>
        </FilterTabs>
        
        <ActionButtons>
          <ActionButton onClick={handleCreateNew}>
            + New Chat
          </ActionButton>
          <ActionButton onClick={loadConversations}>
            ↻ Refresh
          </ActionButton>
        </ActionButtons>
      </SidebarHeader>

      <SidebarContent>
        {loading ? (
          <LoadingIndicator>
            Loading conversations...
          </LoadingIndicator>
        ) : error ? (
          <LoadingIndicator style={{ color: '#dc2626' }}>
            Error: {error}
          </LoadingIndicator>
        ) : filteredConversations.length === 0 ? (
          <EmptyState>
            <EmptyStateIcon>💬</EmptyStateIcon>
            <EmptyStateText>
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </EmptyStateText>
            <EmptyStateSubtext>
              {searchQuery 
                ? 'Try a different search term'
                : 'Start a new conversation to begin'
              }
            </EmptyStateSubtext>
          </EmptyState>
        ) : (
          <ConversationList>
            {filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                isActive={conversation.id === currentConversationId}
                onClick={() => onConversationSelect(conversation)}
              >
                <ConversationHeader>
                  <ConversationName>
                    {conversation.name}
                  </ConversationName>
                  <ConversationTime>
                    {formatTime(conversation.updatedAt)}
                  </ConversationTime>
                </ConversationHeader>
                
                <ConversationPreview>
                  {getPreviewText(conversation)}
                </ConversationPreview>
                
                <ConversationMeta>
                  <MetaTag>
                    {conversation.metadata.messageCount} msgs
                  </MetaTag>
                  {conversation.tags.map(tag => (
                    <MetaTag key={tag}>
                      {tag}
                    </MetaTag>
                  ))}
                </ConversationMeta>
                
                <ConversationActions>
                  {!conversation.isArchived && (
                    <MiniActionButton
                      onClick={(e) => handleArchiveConversation(conversation.id, e)}
                    >
                      Archive
                    </MiniActionButton>
                  )}
                  <MiniActionButton
                    onClick={(e) => handleDeleteConversation(conversation.id, e)}
                  >
                    Delete
                  </MiniActionButton>
                </ConversationActions>
              </ConversationItem>
            ))}
          </ConversationList>
        )}
      </SidebarContent>
    </SidebarContainer>
  );
}; 