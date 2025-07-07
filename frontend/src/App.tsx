import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import ReactMarkdown from 'react-markdown';

// Layout
const AppContainer = styled.div`
  height: 100vh;
  display: flex;
  background: #ffffff;
  color: #333333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;

const Sidebar = styled.div<{ show: boolean }>`
  width: ${props => props.show ? '320px' : '0'};
  background: #fafafa;
  border-right: 1px solid #e5e5e7;
  transition: width 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: inset -1px 0 3px rgba(0, 0, 0, 0.05);
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
  margin: 0;
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

const SidebarContent = styled.div`
  flex: 1;
  padding: 16px;
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

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const Title = styled.h1`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333333;
`;

const Footer = styled.footer`
  background: #f8f9fa;
  border-top: 1px solid #e5e5e5;
  padding: 8px 24px;
  text-align: center;
  font-size: 12px;
  color: #666;
  
  a {
    color: #dc2626;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
`;

const ModeToggle = styled.div`
  display: flex;
  background: #f7f7f8;
  border-radius: 8px;
  padding: 2px;
`;

const ModeButton = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  background: ${props => props.active ? '#dc2626' : 'transparent'};
  color: ${props => props.active ? '#ffffff' : '#666666'};
  
  &:hover {
    background: ${props => props.active ? '#dc2626' : '#f5f5f5'};
  }
`;

const ChatContainer = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0;
`;

const MessageWrapper = styled.div<{ isUser?: boolean }>`
  padding: 24px;
  border-bottom: 1px solid #f0f0f0;
  
  ${props => props.isUser ? `
    background: #f9f9f9;
  ` : `
    background: #ffffff;
  `}
`;

const MessageContainer = styled.div`
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  gap: 16px;
  align-items: flex-start;
`;

const Avatar = styled.div<{ isUser?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${props => props.isUser ? '#dc2626' : '#6b7280'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
`;

const MessageContent = styled.div`
  flex: 1;
  line-height: 1.6;
`;

const UserMessage = styled.div`
  font-size: 16px;
  color: #333333;
`;

const AIMessage = styled.div`
  font-size: 16px;
  color: #333333;
`;



// Search Results Display
const SearchResultsContainer = styled.div`
  margin: 20px 0;
  background: #ffffff;
  border: 1px solid #e5e5e7;
  border-radius: 12px;
  overflow: hidden;
`;

const SearchResultsHeader = styled.div`
  padding: 16px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e5e7;
  display: flex;
  align-items: center;
  justify-content: between;
`;

const SearchResultsTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333333;
`;

const ResultsList = styled.div`
  max-height: 400px;
  overflow-y: auto;
`;

const ResultItem = styled.div<{ expanded?: boolean }>`
  border-bottom: 1px solid #f0f0f0;
  
  &:last-child {
    border-bottom: none;
  }
`;

const ResultHeader = styled.div`
  padding: 16px 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background-color 0.2s ease;
  
  &:hover {
    background: #f8f9fa;
  }
`;

const ResultIcon = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: #e3f2fd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
`;

const ResultInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ResultTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #1976d2;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultUrl = styled.div`
  font-size: 12px;
  color: #666666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ExpandIcon = styled.div<{ expanded?: boolean }>`
  font-size: 12px;
  color: #666666;
  transform: ${props => props.expanded ? 'rotate(90deg)' : 'rotate(0deg)'};
  transition: transform 0.2s ease;
`;

const ResultDetails = styled.div<{ expanded?: boolean }>`
  max-height: ${props => props.expanded ? '300px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease;
  background: #fafafa;
`;

const ResultDetailsContent = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #e5e5e7;
`;

const ResultDescription = styled.p`
  margin: 0 0 12px 0;
  font-size: 14px;
  line-height: 1.5;
  color: #333333;
`;

const ResultMetadata = styled.div`
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #666666;
`;

// Main Results
const ResultSection = styled.div`
  margin: 20px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
`;

const SectionTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333333;
`;

const MetricsRow = styled.div`
  display: flex;
  gap: 24px;
  margin: 16px 0;
`;

const Metric = styled.div`
  text-align: center;
`;

const MetricValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #10a37f;
`;

const MetricLabel = styled.div`
  font-size: 12px;
  color: #6c757d;
  margin-top: 4px;
`;

// Input Area
const InputSection = styled.div`
  border-top: 1px solid #e5e5e5;
  background: #ffffff;
  padding: 24px;
`;

const InputContainer = styled.div`
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InputModeToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InputModeButton = styled.button<{ active: boolean }>`
  padding: 6px 12px;
  border: 1px solid ${props => props.active ? '#dc2626' : '#e5e5e7'};
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  background: ${props => props.active ? '#dc2626' : '#ffffff'};
  color: ${props => props.active ? '#ffffff' : '#6b7280'};
  
  &:hover {
    background: ${props => props.active ? '#dc2626' : '#f9fafb'};
    border-color: ${props => props.active ? '#dc2626' : '#d0d0d0'};
  }
`;

const InputWrapper = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 12px;
  
  &:focus-within {
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const Input = styled.textarea`
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  line-height: 1.5;
  color: #333333;
  background: transparent;
  resize: none;
  max-height: 120px;
  min-height: 20px;
  
  &::placeholder {
    color: #9ca3af;
  }
`;

const SendButton = styled.button`
  padding: 8px 16px;
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #b91c1c;
  }
  
  &:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }
`;

// Loading
const LoadingDots = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
  
  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #dc2626;
    animation: pulse 1.4s infinite ease-in-out;
  }
  
  span:nth-child(1) { animation-delay: -0.32s; }
  span:nth-child(2) { animation-delay: -0.16s; }
  span:nth-child(3) { animation-delay: 0s; }
  
  @keyframes pulse {
    0%, 80%, 100% { 
      transform: scale(0.8);
      opacity: 0.4;
    }
    40% { 
      transform: scale(1);
      opacity: 1;
    }
  }
`;

// Markdown
const MarkdownContent = styled.div`
  line-height: 1.6;
  
  h1, h2, h3, h4, h5, h6 {
    margin: 20px 0 12px 0;
    color: #333333;
    font-weight: 600;
  }
  
  p {
    margin: 12px 0;
    color: #333333;
  }
  
  ul, ol {
    margin: 12px 0;
    padding-left: 20px;
    
    li {
      margin: 6px 0;
      color: #333333;
    }
  }
  
  code {
    background: #f1f3f4;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Monaco', monospace;
    font-size: 0.9em;
    color: #d73a49;
  }
  
  pre {
    background: #f6f8fa;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 16px 0;
    border: 1px solid #e1e4e8;
    
    code {
      background: none;
      padding: 0;
      color: #333333;
    }
  }
  
  blockquote {
    border-left: 4px solid #dfe2e5;
    padding-left: 16px;
    margin: 16px 0;
    color: #6a737d;
    font-style: italic;
  }
  
  a {
    color: #0366d6;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
`;

// Interfaces
interface ResearchStep {
  id: string;
  step: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  description: string;
  data?: any;
  timestamp: Date;
}

interface SearchResult {
  id: string;
  title: string;
  url: string;
  description?: string;
  snippet?: string;
  domain?: string;
}

interface ResearchResult {
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
  steps: ResearchStep[];
  searchResults?: SearchResult[];
  agentUsed?: string;
  executionTime?: number;
  collaboration?: boolean;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  steps?: ResearchStep[];
  result?: ResearchResult;
  timestamp: Date;
  mode?: 'chat' | 'research';
  contextUsed?: boolean;
  isFollowUp?: boolean;
  agentUsed?: string;
  executionTime?: number;
}

interface AgentCapability {
  name: string;
  description: string;
  domains: string[];
  complexity: 'simple' | 'medium' | 'complex';
  priority: number;
}

interface AgentPerformance {
  successRate: number;
  averageResponseTime: number;
  totalQueries: number;
  lastUsed: string;
  errorCount: number;
}

interface SpecializedAgent {
  id: string;
  name: string;
  isActive: boolean;
  loadFactor: number;
  capabilities: AgentCapability[];
  performance: AgentPerformance;
}

interface OrchestratorMetrics {
  totalQueries: number;
  averageResponseTime: number;
  successRate: number;
  agentUsage: Record<string, number>;
}

type Mode = 'chat' | 'research';

// Thread History Components
const ThreadHistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 100%;
  overflow-y: auto;
  
  /* Stagger animation for thread items */
  .thread-item {
    animation: slideInUp 0.3s ease-out;
    animation-fill-mode: both;
  }
  
  .thread-item:nth-child(1) { animation-delay: 0.05s; }
  .thread-item:nth-child(2) { animation-delay: 0.1s; }
  .thread-item:nth-child(3) { animation-delay: 0.15s; }
  .thread-item:nth-child(4) { animation-delay: 0.2s; }
  .thread-item:nth-child(5) { animation-delay: 0.25s; }
  
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const ThreadItem = styled.div<{ isActive?: boolean }>`
  padding: 16px;
  border-radius: 12px;
  border: 1px solid ${props => props.isActive ? '#dc2626' : '#e5e5e7'};
  background: ${props => props.isActive ? '#fef2f2' : '#ffffff'};
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: ${props => props.isActive ? 'linear-gradient(90deg, #dc2626, #ef4444)' : 'transparent'};
    opacity: ${props => props.isActive ? 1 : 0};
    transition: opacity 0.2s ease;
  }
  
  &:hover {
    background: ${props => props.isActive ? '#fef2f2' : '#f9fafb'};
    border-color: ${props => props.isActive ? '#dc2626' : '#d1d5db'};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const ThreadHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const ThreadType = styled.span<{ type: 'chat' | 'research' }>`
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  ${props => props.type === 'research' ? `
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  ` : `
    background: #f3f4f6;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  `}
`;

const ThreadTimestamp = styled.span`
  font-size: 10px;
  color: #9ca3af;
  font-weight: 500;
`;

const ThreadQuery = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
`;

const ThreadSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const ThreadMetric = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #6b7280;
  background: #f9fafb;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  font-weight: 500;
`;

const ThreadStatus = styled.span<{ status: 'completed' | 'running' | 'error' | 'pending' }>`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  
  ${props => props.status === 'completed' && `
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
  `}
  ${props => props.status === 'running' && `
    color: #f59e0b;
    background: #fffbeb;
    border: 1px solid #fde68a;
  `}
  ${props => props.status === 'error' && `
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
  `}
  ${props => props.status === 'pending' && `
    color: #6b7280;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
  `}
`;

const EmptyThreadHistory = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #6b7280;
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .empty-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #374151;
  }
  
  .empty-description {
    font-size: 13px;
    line-height: 1.5;
    opacity: 0.8;
  }
`;

const ClearHistoryButton = styled.button`
  padding: 12px 16px;
  margin-top: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  
  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #374151;
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &::before {
    content: "🗑️";
    font-size: 12px;
  }
`;

const ContextIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6b7280;
  margin-top: 8px;
  padding: 4px 8px;
  background: #f3f4f6;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  width: fit-content;
  cursor: help;
  transition: all 0.2s ease;
  
  &:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
  }
`;

const ContextIcon = styled.span`
  font-size: 12px;
  animation: pulse 2s infinite;
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
`;

// Agent Management UI Components
const AgentPanel = styled.div<{ show: boolean }>`
  position: fixed;
  top: 0;
  right: ${props => props.show ? '0' : '-400px'};
  width: 400px;
  height: 100vh;
  background: #ffffff;
  border-left: 1px solid #e5e5e7;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  transition: right 0.3s ease;
  z-index: 1000;
  display: flex;
  flex-direction: column;
`;

const AgentPanelHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid #e5e5e7;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AgentPanelTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
  
  &::before {
    content: "🤖";
    font-size: 16px;
  }
`;

const CloseButton = styled.button`
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s ease;
  
  &:hover {
    background: #e5e7eb;
    color: #374151;
  }
`;

const AgentPanelContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
`;

const AgentCard = styled.div<{ isActive: boolean }>`
  padding: 16px;
  border-radius: 12px;
  border: 1px solid ${props => props.isActive ? '#dc2626' : '#e5e7eb'};
  background: ${props => props.isActive ? '#fef2f2' : '#f9fafb'};
  margin-bottom: 16px;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: ${props => props.isActive ? '#dc2626' : '#d1d5db'};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

const AgentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const AgentName = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
`;

const AgentStatus = styled.span<{ isActive: boolean }>`
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  
  ${props => props.isActive ? `
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  ` : `
    background: #f3f4f6;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  `}
`;

const AgentMetrics = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
`;

const MetricItem = styled.div`
  text-align: center;
  padding: 8px;
  background: #ffffff;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
`;

const AgentMetricValue = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
`;

const AgentMetricLabel = styled.div`
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  margin-top: 2px;
`;

const AgentCapabilities = styled.div`
  margin-bottom: 12px;
`;

const CapabilityTag = styled.span`
  display: inline-block;
  padding: 2px 6px;
  margin: 2px;
  background: #e5e7eb;
  color: #374151;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
`;

const AgentToggle = styled.button<{ isActive: boolean }>`
  width: 100%;
  padding: 8px 16px;
  border: 1px solid ${props => props.isActive ? '#dc2626' : '#e5e7eb'};
  border-radius: 6px;
  background: ${props => props.isActive ? '#dc2626' : '#ffffff'};
  color: ${props => props.isActive ? '#ffffff' : '#6b7280'};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.isActive ? '#b91c1c' : '#f9fafb'};
  }
`;

const MetricsSection = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
`;

const MetricsTitle = styled.h3`
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const AgentToggleButton = styled.button`
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px;
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  transition: all 0.2s ease;
  z-index: 999;
  font-size: 16px;
  
  &:hover {
    background: #b91c1c;
    transform: scale(1.05);
  }
`;

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [agents, setAgents] = useState<SpecializedAgent[]>([]);
  const [orchestratorMetrics, setOrchestratorMetrics] = useState<OrchestratorMetrics | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load agent information on startup
    loadAgentData();
    const interval = setInterval(loadAgentData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadAgentData = async () => {
    try {
      const [agentsResponse, metricsResponse] = await Promise.all([
        fetch('/api/orchestrator/agents'),
        fetch('/api/orchestrator/metrics')
      ]);

      if (agentsResponse.ok) {
        const agentsData = await agentsResponse.json();
        setAgents(agentsData.agents);
      }

      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setOrchestratorMetrics(metricsData.metrics);
      }
    } catch (error) {
      console.error('Failed to load agent data:', error);
    }
  };

  const toggleAgent = async (agentId: string, activate: boolean) => {
    try {
      const action = activate ? 'activate' : 'deactivate';
      const response = await fetch(`/api/orchestrator/agents/${agentId}/${action}`, {
        method: 'POST'
      });

      if (response.ok) {
        loadAgentData(); // Refresh agent data
      }
    } catch (error) {
      console.error(`Failed to ${activate ? 'activate' : 'deactivate'} agent:`, error);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  const getThreadStatus = (message: ChatMessage) => {
    if (message.type === 'user') return 'pending';
    if (loading && message.id === messages[messages.length - 1]?.id) return 'running';
    if (message.content || message.result) return 'completed';
    return 'error';
  };

  const getThreadIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'error': return '❌';
      default: return '⏸️';
    }
  };

  const getConversationThreads = () => {
    const threads: { userMessage: ChatMessage; assistantMessage?: ChatMessage }[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.type === 'user') {
        const nextMessage = messages[i + 1];
        threads.push({
          userMessage: message,
          assistantMessage: nextMessage && nextMessage.type === 'assistant' ? nextMessage : undefined
        });
      }
    }
    
    return threads.reverse(); // Show newest first
  };

  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSelectedThreadId(messageId);
    }
  };

  const clearThreadHistory = () => {
    if (window.confirm('Are you sure you want to clear all thread history? This cannot be undone.')) {
      setMessages([]);
      setSelectedThreadId(null);
    }
  };

  const getConversationContext = (currentMessages: ChatMessage[], limit: number = 10) => {
    // Get the last N messages (excluding the current one being processed)
    const contextMessages = currentMessages.slice(-limit - 1, -1);
    
    // Prioritize recent messages and important context
    const prioritizedMessages = contextMessages.reduce((acc: any[], msg, index) => {
      const messageContext = {
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        mode: msg.mode,
        importance: calculateMessageImportance(msg, index, contextMessages.length)
      };
      
      // Always include the last 3 messages for immediate context
      if (index >= contextMessages.length - 3) {
        acc.push(messageContext);
      } else if (messageContext.importance > 0.5) {
        // Include important messages even if they're older
        acc.push(messageContext);
      }
      
      return acc;
    }, []);
    
    // Sort by timestamp to maintain conversation flow
    return prioritizedMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  };

  const calculateMessageImportance = (message: ChatMessage, index: number, totalMessages: number) => {
    let importance = 0;
    
    // Recent messages are more important
    const recencyScore = (index / totalMessages) * 0.4;
    
    // Research results are important
    if (message.result && message.result.findings.length > 0) {
      importance += 0.3;
    }
    
    // Messages with context usage are important
    if (message.contextUsed) {
      importance += 0.2;
    }
    
    // Longer content might be more important
    if (message.content && message.content.length > 200) {
      importance += 0.1;
    }
    
    return Math.min(importance + recencyScore, 1.0);
  };

  const getOptimalContextWindow = (messages: ChatMessage[]) => {
    // Calculate total context size
    const totalSize = messages.reduce((size, msg) => size + msg.content.length, 0);
    
    // Adaptive context window based on message size
    if (totalSize < 1000) return 10;      // Small conversations
    if (totalSize < 5000) return 8;       // Medium conversations
    if (totalSize < 10000) return 6;      // Large conversations
    return 4;                             // Very large conversations
  };

  const isFollowUpQuery = (query: string, previousMessages: ChatMessage[]) => {
    const followUpPatterns = [
      /^(and|also|what about|how about|tell me more|continue|more|explain|elaborate)/i,
      /^(it|this|that|they|them|those|these)\b/i,
      /^(why|how|when|where|what|who)\s+(is|are|was|were|do|does|did)\s+(it|this|that|they|them)/i,
      /^(can you|could you|will you|would you)\s+(explain|tell|show|describe)/i
    ];
    
    const hasRecentContext = previousMessages.length > 0;
    const matchesPattern = followUpPatterns.some(pattern => pattern.test(query.trim()));
    
    return hasRecentContext && (matchesPattern || query.length < 50);
  };

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const toggleResultExpansion = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const isSimpleQuery = (query: string) => {
    const simplePatterns = [
      /^(hi|hello|hey|sup|yo)$/i,
      /^(how are you|how's it going|what's up)$/i,
      /^(good morning|good afternoon|good evening|good night)$/i,
      /^(thanks|thank you|thx)$/i,
      /^(bye|goodbye|see you|cya)$/i,
      /^(yes|no|ok|okay|sure)$/i,
      /^(what|who|where|when|why|how)\s+are\s+you$/i,
      /^(tell me about yourself|what can you do)$/i
    ];
    
    return simplePatterns.some(pattern => pattern.test(query.trim())) || query.trim().length <= 10;
  };

  const handleBasicChat = async (query: string, assistantMessage: ChatMessage) => {
    try {
      const currentMessages = messages.filter(msg => msg.id !== assistantMessage.id);
      const isFollowUp = isFollowUpQuery(query, currentMessages);
      
      // For simple queries without context, provide immediate responses
      if (isSimpleQuery(query) && !isFollowUp) {
        const responses: Record<string, string> = {
          'hi': 'Hi there! How can I help you today?',
          'hello': 'Hello! What would you like to know?',
          'hey': 'Hey! What can I do for you?',
          'how are you': 'I\'m doing well, thank you for asking! How can I assist you?',
          'thanks': 'You\'re welcome! Is there anything else I can help with?',
          'thank you': 'You\'re very welcome! Let me know if you need anything else.',
          'bye': 'Goodbye! Feel free to come back anytime.',
          'good morning': 'Good morning! Hope you have a great day. How can I help?',
          'good afternoon': 'Good afternoon! What can I assist you with today?',
          'good evening': 'Good evening! How can I help you tonight?',
          'what can you do': 'I can help you with research, answer questions, and have conversations. Try switching to Research mode for in-depth analysis!',
          'tell me about yourself': 'I\'m an AI research agent that can help with various tasks. I can chat with you or conduct detailed research - just toggle between Chat and Research modes!'
        };
        
        const response = responses[query.toLowerCase().trim()] || 'I\'m here to help! Feel free to ask me anything or switch to Research mode for detailed analysis.';
        
        // Simulate a brief delay to feel natural
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: response }
            : msg
        ));
        return;
      }

      // For complex queries or follow-ups, use the API with context
      const optimalLimit = getOptimalContextWindow(currentMessages);
      const conversationContext = getConversationContext(currentMessages, optimalLimit);
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: query,
          context: conversationContext,
          isFollowUp: isFollowUp,
          mode: 'chat',
          preferredAgent: selectedAgent
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id 
          ? { 
              ...msg, 
              content: data.response,
              contextUsed: data.contextUsed,
              isFollowUp: isFollowUp,
              agentUsed: data.agentUsed,
              executionTime: data.executionTime
            }
          : msg
      ));
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id 
          ? { ...msg, content: 'Sorry, I encountered an error. Please try again.' }
          : msg
      ));
    }
  };

  const handleResearch = async (query: string, assistantMessage: ChatMessage) => {
    try {
      const currentMessages = messages.filter(msg => msg.id !== assistantMessage.id);
      const isFollowUp = isFollowUpQuery(query, currentMessages);
      const optimalLimit = getOptimalContextWindow(currentMessages);
      const conversationContext = getConversationContext(currentMessages, optimalLimit);
      
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: query,
          context: conversationContext,
          isFollowUp: isFollowUp,
          mode: 'research',
          preferredAgent: selectedAgent || 'research',
          enableCollaboration: mode === 'research' && !selectedAgent
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'step') {
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { 
                          ...msg, 
                          steps: [...(msg.steps || []), data.step]
                        }
                      : msg
                  ));
                } else if (data.type === 'result') {
                  // Create mock search results for demonstration
                  const mockSearchResults: SearchResult[] = data.result.sources.map((source: string, index: number) => ({
                    id: `result-${index}`,
                    title: `${extractDomain(source)} - Research Result`,
                    url: source,
                    description: `Relevant information found about ${query}`,
                    snippet: `This source contains valuable information related to your research query about ${query}.`,
                    domain: extractDomain(source)
                  }));

                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { 
                          ...msg, 
                          result: { ...data.result, searchResults: mockSearchResults },
                          content: data.result.synthesis,
                          contextUsed: data.contextUsed,
                          isFollowUp: isFollowUp,
                          agentUsed: data.result.metadata?.agentId,
                          executionTime: data.result.executionTime
                        }
                      : msg
                  ));
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id 
          ? { ...msg, content: 'Sorry, I encountered an error during research. Please try again.' }
          : msg
      ));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
      mode,
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      type: 'assistant',
      content: '',
      steps: [],
      timestamp: new Date(),
      mode,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setLoading(true);
    setExpandedResults(new Set());

    try {
      if (mode === 'chat') {
        await handleBasicChat(userMessage.content, assistantMessage);
      } else {
        await handleResearch(userMessage.content, assistantMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getPlaceholder = () => {
    let basePlaceholder = mode === 'chat' 
      ? 'Message AI Research Agent...' 
      : 'Ask me to research something...';
      
    if (selectedAgent) {
      basePlaceholder += ` (using ${selectedAgent} agent)`;
    }
    
    return basePlaceholder;
  };

  const conversationThreads = getConversationThreads();
  const showSidebar = messages.length > 0;

  return (
    <AppContainer>
      <AgentToggleButton onClick={() => setShowAgentPanel(!showAgentPanel)}>
        🤖
      </AgentToggleButton>

      <AgentPanel show={showAgentPanel}>
        <AgentPanelHeader>
          <AgentPanelTitle>Agent Orchestrator</AgentPanelTitle>
          <CloseButton onClick={() => setShowAgentPanel(false)}>
            ✕
          </CloseButton>
        </AgentPanelHeader>
        
        <AgentPanelContent>
          {orchestratorMetrics && (
            <MetricsSection>
              <MetricsTitle>System Performance</MetricsTitle>
              <MetricsGrid>
                <MetricItem>
                  <AgentMetricValue>{orchestratorMetrics.totalQueries}</AgentMetricValue>
                  <AgentMetricLabel>Total Queries</AgentMetricLabel>
                </MetricItem>
                <MetricItem>
                  <AgentMetricValue>{Math.round(orchestratorMetrics.averageResponseTime)}ms</AgentMetricValue>
                  <AgentMetricLabel>Avg Response</AgentMetricLabel>
                </MetricItem>
                <MetricItem>
                  <AgentMetricValue>{Math.round(orchestratorMetrics.successRate * 100)}%</AgentMetricValue>
                  <AgentMetricLabel>Success Rate</AgentMetricLabel>
                </MetricItem>
                <MetricItem>
                  <AgentMetricValue>{agents.filter(a => a.isActive).length}/{agents.length}</AgentMetricValue>
                  <AgentMetricLabel>Active Agents</AgentMetricLabel>
                </MetricItem>
              </MetricsGrid>
            </MetricsSection>
          )}

          {agents.map(agent => (
            <AgentCard key={agent.id} isActive={agent.isActive}>
              <AgentHeader>
                <AgentName>{agent.name}</AgentName>
                <AgentStatus isActive={agent.isActive}>
                  {agent.isActive ? 'Active' : 'Inactive'}
                </AgentStatus>
              </AgentHeader>
              
              <AgentMetrics>
                <MetricItem>
                  <AgentMetricValue>{Math.round(agent.performance.successRate * 100)}%</AgentMetricValue>
                  <AgentMetricLabel>Success Rate</AgentMetricLabel>
                </MetricItem>
                <MetricItem>
                  <AgentMetricValue>{agent.performance.totalQueries}</AgentMetricValue>
                  <AgentMetricLabel>Total Queries</AgentMetricLabel>
                </MetricItem>
              </AgentMetrics>
              
              <AgentCapabilities>
                {agent.capabilities.map(capability => (
                  <CapabilityTag key={capability.name}>
                    {capability.name.replace('_', ' ')}
                  </CapabilityTag>
                ))}
              </AgentCapabilities>
              
              <AgentToggle
                isActive={agent.isActive}
                onClick={() => toggleAgent(agent.id, !agent.isActive)}
              >
                {agent.isActive ? 'Deactivate' : 'Activate'} Agent
              </AgentToggle>
            </AgentCard>
          ))}
        </AgentPanelContent>
      </AgentPanel>

      <Sidebar show={showSidebar}>
        <SidebarHeader>
          <SidebarTitle>Thread History</SidebarTitle>
        </SidebarHeader>
        <SidebarContent>
          {conversationThreads.length > 0 ? (
            <>
              <ThreadHistoryContainer>
                {conversationThreads.map((thread) => {
                  const status = thread.assistantMessage 
                    ? getThreadStatus(thread.assistantMessage)
                    : (loading && thread.userMessage.id === messages[messages.length - 1]?.id ? 'running' : 'pending');
                  
                  return (
                    <ThreadItem
                      key={thread.userMessage.id}
                      className="thread-item"
                      isActive={selectedThreadId === thread.userMessage.id}
                      onClick={() => scrollToMessage(thread.userMessage.id)}
                    >
                      <ThreadHeader>
                        <ThreadType type={thread.userMessage.mode || 'chat'}>
                          {thread.userMessage.mode || 'chat'}
                        </ThreadType>
                        <ThreadTimestamp>
                          {formatTimestamp(thread.userMessage.timestamp)}
                        </ThreadTimestamp>
                      </ThreadHeader>
                      
                      <ThreadQuery>
                        {thread.userMessage.content}
                      </ThreadQuery>
                      
                      <ThreadSummary>
                        <ThreadStatus status={status}>
                          {getThreadIcon(status)}
                          {status}
                        </ThreadStatus>
                        
                        {thread.assistantMessage?.contextUsed && (
                          <ThreadMetric>
                            🧠 Context used
                          </ThreadMetric>
                        )}
                        
                        {thread.assistantMessage?.agentUsed && (
                          <ThreadMetric>
                            🤖 {thread.assistantMessage.agentUsed}
                          </ThreadMetric>
                        )}
                        
                        {thread.assistantMessage?.result && (
                          <>
                            <ThreadMetric>
                              🔍 {thread.assistantMessage.result.findings.length} findings
                            </ThreadMetric>
                            <ThreadMetric>
                              📄 {thread.assistantMessage.result.sources.length} sources
                            </ThreadMetric>
                          </>
                        )}
                        
                        {thread.assistantMessage?.steps && (
                          <ThreadMetric>
                            ⚡ {thread.assistantMessage.steps.length} steps
                          </ThreadMetric>
                        )}
                      </ThreadSummary>
                    </ThreadItem>
                  );
                })}
              </ThreadHistoryContainer>
              
              <ClearHistoryButton onClick={clearThreadHistory}>
                Clear History
              </ClearHistoryButton>
            </>
          ) : (
            <EmptyThreadHistory>
              <div className="empty-icon">💭</div>
              <div className="empty-title">No conversations yet</div>
              <div className="empty-description">
                Start chatting or researching to build your conversation history
              </div>
            </EmptyThreadHistory>
          )}
        </SidebarContent>
      </Sidebar>

      <MainContent>
        <Header>
          <Title>AI Research Agent</Title>
          <ModeToggle>
            <ModeButton 
              active={mode === 'chat'} 
              onClick={() => setMode('chat')}
            >
              Chat
            </ModeButton>
            <ModeButton 
              active={mode === 'research'} 
              onClick={() => setMode('research')}
            >
              Research
            </ModeButton>
          </ModeToggle>
        </Header>
        
        <ChatContainer>
          <MessagesContainer>
            {messages.map((message) => (
              <MessageWrapper key={message.id} id={`message-${message.id}`} isUser={message.type === 'user'}>
                <MessageContainer>
                  <Avatar isUser={message.type === 'user'}>
                    {message.type === 'user' ? 'You' : 'AI'}
                  </Avatar>
                  <MessageContent>
                    {message.type === 'user' ? (
                      <UserMessage>
                        {message.content}
                      </UserMessage>
                    ) : (
                      <AIMessage>
                        {message.content && (
                          <MarkdownContent>
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </MarkdownContent>
                        )}
                        
                        {message.contextUsed && (
                          <ContextIndicator>
                            <ContextIcon>🧠</ContextIcon>
                            {message.isFollowUp ? 'Used conversation context' : 'Referenced previous messages'}
                          </ContextIndicator>
                        )}
                        
                        {message.agentUsed && (
                          <ContextIndicator>
                            <ContextIcon>🤖</ContextIcon>
                            Agent: {message.agentUsed}
                          </ContextIndicator>
                        )}

                        {message.result && message.result.searchResults && (
                          <SearchResultsContainer>
                            <SearchResultsHeader>
                              <SearchResultsTitle>Search Results</SearchResultsTitle>
                            </SearchResultsHeader>
                            <ResultsList>
                              {message.result.searchResults.map((result) => (
                                <ResultItem key={result.id}>
                                  <ResultHeader onClick={() => toggleResultExpansion(result.id)}>
                                    <ResultIcon>🔗</ResultIcon>
                                    <ResultInfo>
                                      <ResultTitle>{result.title}</ResultTitle>
                                      <ResultUrl>{result.url}</ResultUrl>
                                    </ResultInfo>
                                    <ExpandIcon expanded={expandedResults.has(result.id)}>
                                      ▶
                                    </ExpandIcon>
                                  </ResultHeader>
                                  <ResultDetails expanded={expandedResults.has(result.id)}>
                                    <ResultDetailsContent>
                                      <ResultDescription>
                                        {result.description}
                                      </ResultDescription>
                                      <ResultDescription>
                                        {result.snippet}
                                      </ResultDescription>
                                      <ResultMetadata>
                                        <span>Domain: {result.domain}</span>
                                        <span>Source: Web</span>
                                      </ResultMetadata>
                                    </ResultDetailsContent>
                                  </ResultDetails>
                                </ResultItem>
                              ))}
                            </ResultsList>
                          </SearchResultsContainer>
                        )}
                        
                        {message.result && (
                          <>
                            <ResultSection>
                              <SectionTitle>Research Summary</SectionTitle>
                              <MetricsRow>
                                <Metric>
                                  <MetricValue>{message.result.findings.length}</MetricValue>
                                  <MetricLabel>Key Findings</MetricLabel>
                                </Metric>
                                <Metric>
                                  <MetricValue>{message.result.sources.length}</MetricValue>
                                  <MetricLabel>Sources</MetricLabel>
                                </Metric>
                                <Metric>
                                  <MetricValue>{Math.round(message.result.confidence * 100)}%</MetricValue>
                                  <MetricLabel>Confidence</MetricLabel>
                                </Metric>
                              </MetricsRow>
                            </ResultSection>

                            {message.result.findings.length > 0 && (
                              <ResultSection>
                                <SectionTitle>Key Findings</SectionTitle>
                                <ul>
                                  {message.result.findings.map((finding, index) => (
                                    <li key={index}>{finding}</li>
                                  ))}
                                </ul>
                              </ResultSection>
                            )}
                          </>
                        )}

                        {loading && message.id === messages[messages.length - 1]?.id && !message.content && (
                          <div style={{ padding: '20px 0' }}>
                            <LoadingDots>
                              <span></span>
                              <span></span>
                              <span></span>
                            </LoadingDots>
                           </div>
                        )}
                      </AIMessage>
                    )}
                  </MessageContent>
                </MessageContainer>
              </MessageWrapper>
            ))}
            <div ref={messagesEndRef} />
          </MessagesContainer>

          <InputSection>
            <form onSubmit={handleSubmit}>
              <InputContainer>
                <InputModeToggle>
                  <InputModeButton active={mode === 'chat'} onClick={() => setMode('chat')}>
                    Chat
                  </InputModeButton>
                  <InputModeButton active={mode === 'research'} onClick={() => setMode('research')}>
                    Research
                  </InputModeButton>
                  {selectedAgent && (
                    <InputModeButton active={false} onClick={() => setSelectedAgent(null)}>
                      Agent: {selectedAgent} ✕
                    </InputModeButton>
                  )}
                </InputModeToggle>
                <InputWrapper>
                  <Input
                    placeholder={getPlaceholder()}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    rows={1}
                  />
                  <SendButton type="submit" disabled={loading || !input.trim()}>
                    {loading ? 'Sending...' : 'Send'}
                  </SendButton>
                </InputWrapper>
              </InputContainer>
            </form>
          </InputSection>
        </ChatContainer>
        
        <Footer>
          Developed by{' '}
          <a href="https://www.linkedin.com/in/yadidya-medepalli/" target="_blank" rel="noopener noreferrer">
            Yadidya Medepalli
          </a>
          {' & '}
          <a href="https://www.linkedin.com/in/monicajayakumar/" target="_blank" rel="noopener noreferrer">
            Monia Jayakumar
          </a>
        </Footer>
      </MainContent>
    </AppContainer>
  );
}

export default App;
