import { UnifiedAgent, UnifiedAgentConfig } from './UnifiedAgent';
import { AgentStep, ExecutionResult } from '../types';

export interface AgentCapability {
  name: string;
  description: string;
  domains: string[];
  complexity: 'simple' | 'medium' | 'complex';
  priority: number;
}

export interface AgentPerformance {
  successRate: number;
  averageResponseTime: number;
  totalQueries: number;
  lastUsed: Date;
  errorCount: number;
}

export interface SpecializedAgent {
  id: string;
  name: string;
  agent: UnifiedAgent;
  capabilities: AgentCapability[];
  performance: AgentPerformance;
  isActive: boolean;
  loadFactor: number;
}

export interface OrchestratorConfig {
  loadBalancingEnabled?: boolean;
  maxConcurrentAgents?: number;
  routingStrategy?: 'capability' | 'performance' | 'hybrid';
  performanceWeights?: {
    successRate: number;
    responseTime: number;
    loadFactor: number;
  };
  enableCollaboration?: boolean;
  enableFallback?: boolean;
}

export class AgentOrchestrator {
  private agents: Map<string, SpecializedAgent> = new Map();
  private config: OrchestratorConfig;
  private activeQueries: Map<string, { agentId: string; startTime: Date }> = new Map();
  private queryHistory: Array<{ query: string; agentId: string; success: boolean; responseTime: number; timestamp: Date }> = [];

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      loadBalancingEnabled: true,
      maxConcurrentAgents: 5,
      routingStrategy: 'hybrid',
      performanceWeights: {
        successRate: 0.4,
        responseTime: 0.3,
        loadFactor: 0.3
      },
      enableCollaboration: true,
      enableFallback: true,
      ...config
    };

    this.initializeSpecializedAgents();
  }

  private initializeSpecializedAgents(): void {
    // Research Agent - Deep analysis and information gathering
    this.registerAgent('research', {
      id: 'research',
      name: 'Research Agent',
      agent: UnifiedAgent.createResearchAgent({
        temperature: 0.1,
        maxIterations: 15,
        enableMemory: true,
        enableProgress: true
      }),
      capabilities: [
        {
          name: 'deep_research',
          description: 'Comprehensive research and analysis',
          domains: ['academic', 'scientific', 'technical', 'business'],
          complexity: 'complex',
          priority: 1
        },
        {
          name: 'fact_checking',
          description: 'Verify information accuracy',
          domains: ['verification', 'validation'],
          complexity: 'medium',
          priority: 2
        }
      ],
      performance: this.createDefaultPerformance(),
      isActive: true,
      loadFactor: 0
    });

    // Analysis Agent - Data analysis and pattern recognition
    this.registerAgent('analysis', {
      id: 'analysis',
      name: 'Analysis Agent',
      agent: UnifiedAgent.createAnalysisAgent({
        temperature: 0.05,
        maxIterations: 10,
        enableMemory: true,
        parallelProcessing: true
      }),
      capabilities: [
        {
          name: 'data_analysis',
          description: 'Analyze structured and unstructured data',
          domains: ['data', 'statistics', 'trends'],
          complexity: 'complex',
          priority: 1
        },
        {
          name: 'pattern_recognition',
          description: 'Identify patterns and insights',
          domains: ['patterns', 'insights', 'correlations'],
          complexity: 'medium',
          priority: 2
        }
      ],
      performance: this.createDefaultPerformance(),
      isActive: true,
      loadFactor: 0
    });

    // Creative Agent - Content creation and brainstorming
    this.registerAgent('creative', {
      id: 'creative',
      name: 'Creative Agent',
      agent: new UnifiedAgent({
        provider: 'langchain',
        temperature: 0.8,
        maxIterations: 8,
        enableMemory: true,
        enableProgress: false
      }),
      capabilities: [
        {
          name: 'content_creation',
          description: 'Generate creative content',
          domains: ['writing', 'brainstorming', 'ideation'],
          complexity: 'medium',
          priority: 1
        },
        {
          name: 'creative_problem_solving',
          description: 'Approach problems creatively',
          domains: ['innovation', 'alternatives', 'solutions'],
          complexity: 'medium',
          priority: 2
        }
      ],
      performance: this.createDefaultPerformance(),
      isActive: true,
      loadFactor: 0
    });

    // Technical Agent - Code and technical documentation
    this.registerAgent('technical', {
      id: 'technical',
      name: 'Technical Agent',
      agent: new UnifiedAgent({
        provider: 'langchain',
        temperature: 0.2,
        maxIterations: 12,
        enableMemory: true,
        enableProgress: true
      }),
      capabilities: [
        {
          name: 'code_analysis',
          description: 'Analyze and debug code',
          domains: ['programming', 'debugging', 'architecture'],
          complexity: 'complex',
          priority: 1
        },
        {
          name: 'technical_documentation',
          description: 'Create technical documentation',
          domains: ['documentation', 'specifications'],
          complexity: 'medium',
          priority: 2
        }
      ],
      performance: this.createDefaultPerformance(),
      isActive: true,
      loadFactor: 0
    });

    // Conversational Agent - Natural dialogue and Q&A
    this.registerAgent('conversational', {
      id: 'conversational',
      name: 'Conversational Agent',
      agent: UnifiedAgent.createChatAgent({
        temperature: 0.6,
        maxIterations: 5,
        enableMemory: true,
        enableProgress: false
      }),
      capabilities: [
        {
          name: 'natural_dialogue',
          description: 'Engage in natural conversation',
          domains: ['conversation', 'qa', 'support'],
          complexity: 'simple',
          priority: 1
        },
        {
          name: 'quick_answers',
          description: 'Provide quick factual answers',
          domains: ['facts', 'definitions', 'explanations'],
          complexity: 'simple',
          priority: 2
        }
      ],
      performance: this.createDefaultPerformance(),
      isActive: true,
      loadFactor: 0
    });
  }

  private createDefaultPerformance(): AgentPerformance {
    return {
      successRate: 1.0,
      averageResponseTime: 0,
      totalQueries: 0,
      lastUsed: new Date(),
      errorCount: 0
    };
  }

  private registerAgent(id: string, agent: SpecializedAgent): void {
    this.agents.set(id, agent);
  }

  public async routeQuery(
    query: string,
    context: any = {},
    options: {
      onStep?: (step: AgentStep) => void;
      onThought?: (thought: string) => void;
      onProgress?: (progress: { current: number; total: number; message: string }) => void;
      preferredAgent?: string;
      requireCollaboration?: boolean;
    } = {}
  ): Promise<ExecutionResult> {
    const queryId = this.generateQueryId();
    const startTime = new Date();

    try {
      // Analyze query to determine best agent
      const selectedAgent = await this.selectOptimalAgent(query, context, options);
      
      if (!selectedAgent) {
        throw new Error('No suitable agent found for query');
      }

      // Record active query
      this.activeQueries.set(queryId, {
        agentId: selectedAgent.id,
        startTime
      });

      // Update agent load
      selectedAgent.loadFactor += 1;

      // Execute query
      const result = await this.executeWithAgent(selectedAgent, query, context, options);

      // Record successful execution
      this.recordQueryResult(queryId, selectedAgent.id, query, true, Date.now() - startTime.getTime());

      return result;

    } catch (error) {
      console.error('Query routing failed:', error);
      
      // Try fallback if enabled
      if (this.config.enableFallback) {
        const fallbackResult = await this.attemptFallback(query, context, options);
        if (fallbackResult) {
          return fallbackResult;
        }
      }

      // Record failed execution
      const activeQuery = this.activeQueries.get(queryId);
      if (activeQuery) {
        this.recordQueryResult(queryId, activeQuery.agentId, query, false, Date.now() - startTime.getTime());
      }

      throw error;
    } finally {
      // Clean up
      this.activeQueries.delete(queryId);
      const agent = this.agents.get(this.activeQueries.get(queryId)?.agentId || '');
      if (agent) {
        agent.loadFactor = Math.max(0, agent.loadFactor - 1);
      }
    }
  }

  private async selectOptimalAgent(
    query: string,
    context: any,
    options: any
  ): Promise<SpecializedAgent | null> {
    // If preferred agent is specified and available
    if (options.preferredAgent && this.agents.has(options.preferredAgent)) {
      const preferredAgent = this.agents.get(options.preferredAgent)!;
      if (preferredAgent.isActive) {
        return preferredAgent;
      }
    }

    // Analyze query characteristics
    const queryAnalysis = this.analyzeQuery(query, context);
    
    // Score agents based on capabilities and performance
    const agentScores = new Map<string, number>();
    
    for (const [agentId, agent] of this.agents) {
      if (!agent.isActive) continue;
      
      const score = this.calculateAgentScore(agent, queryAnalysis);
      agentScores.set(agentId, score);
    }

    // Find best agent
    let bestAgent: SpecializedAgent | null = null;
    let bestScore = -1;

    for (const [agentId, score] of agentScores) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = this.agents.get(agentId)!;
      }
    }

    return bestAgent;
  }

  private analyzeQuery(query: string, context: any): {
    complexity: 'simple' | 'medium' | 'complex';
    domains: string[];
    intent: string;
    requiresResearch: boolean;
    requiresAnalysis: boolean;
    requiresCreativity: boolean;
    requiresTechnical: boolean;
  } {
    const queryLower = query.toLowerCase();
    
    // Determine complexity
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (query.length > 100 || queryLower.includes('analyze') || queryLower.includes('research')) {
      complexity = 'medium';
    }
    if (query.length > 200 || queryLower.includes('comprehensive') || queryLower.includes('detailed')) {
      complexity = 'complex';
    }

    // Identify domains
    const domains: string[] = [];
    if (queryLower.includes('code') || queryLower.includes('programming')) domains.push('programming');
    if (queryLower.includes('data') || queryLower.includes('analyze')) domains.push('data');
    if (queryLower.includes('research') || queryLower.includes('study')) domains.push('academic');
    if (queryLower.includes('create') || queryLower.includes('generate')) domains.push('creative');
    if (queryLower.includes('business') || queryLower.includes('market')) domains.push('business');

    // Determine intent
    let intent = 'general';
    if (queryLower.includes('how') || queryLower.includes('what') || queryLower.includes('why')) {
      intent = 'question';
    } else if (queryLower.includes('create') || queryLower.includes('write')) {
      intent = 'creation';
    } else if (queryLower.includes('analyze') || queryLower.includes('examine')) {
      intent = 'analysis';
    }

    return {
      complexity,
      domains,
      intent,
      requiresResearch: queryLower.includes('research') || queryLower.includes('find') || queryLower.includes('information'),
      requiresAnalysis: queryLower.includes('analyze') || queryLower.includes('data') || queryLower.includes('trends'),
      requiresCreativity: queryLower.includes('create') || queryLower.includes('brainstorm') || queryLower.includes('ideas'),
      requiresTechnical: queryLower.includes('code') || queryLower.includes('programming') || queryLower.includes('technical')
    };
  }

  private calculateAgentScore(agent: SpecializedAgent, queryAnalysis: any): number {
    let score = 0;

    // Capability matching
    for (const capability of agent.capabilities) {
      // Domain matching
      const domainMatch = capability.domains.some(domain => 
        queryAnalysis.domains.includes(domain)
      );
      if (domainMatch) {
        score += capability.priority * 10;
      }

      // Complexity matching
      if (capability.complexity === queryAnalysis.complexity) {
        score += 5;
      }

      // Specific capability matching
      if (queryAnalysis.requiresResearch && capability.name.includes('research')) score += 15;
      if (queryAnalysis.requiresAnalysis && capability.name.includes('analysis')) score += 15;
      if (queryAnalysis.requiresCreativity && capability.name.includes('creative')) score += 15;
      if (queryAnalysis.requiresTechnical && capability.name.includes('technical')) score += 15;
    }

    // Performance scoring
    if (this.config.performanceWeights) {
      const perfScore = 
        (agent.performance.successRate * this.config.performanceWeights.successRate) +
        ((1 - Math.min(agent.performance.averageResponseTime / 10000, 1)) * this.config.performanceWeights.responseTime) +
        ((1 - Math.min(agent.loadFactor / 10, 1)) * this.config.performanceWeights.loadFactor);
      
      score += perfScore * 20;
    }

    return score;
  }

  private async executeWithAgent(
    agent: SpecializedAgent,
    query: string,
    context: any,
    options: any
  ): Promise<ExecutionResult> {
    const taskType = this.determineTaskType(query, agent);
    
    return await agent.agent.execute(query, taskType, {
      onStep: options.onStep,
      onThought: options.onThought,
      onProgress: options.onProgress
    });
  }

  private determineTaskType(query: string, agent: SpecializedAgent): 'research' | 'analysis' | 'synthesis' | 'chat' {
    const queryLower = query.toLowerCase();
    
    if (agent.id === 'research' || queryLower.includes('research')) return 'research';
    if (agent.id === 'analysis' || queryLower.includes('analyze')) return 'analysis';
    if (agent.id === 'creative' || queryLower.includes('create')) return 'synthesis';
    return 'chat';
  }

  private async attemptFallback(
    query: string,
    context: any,
    options: any
  ): Promise<ExecutionResult | null> {
    // Try conversational agent as fallback
    const fallbackAgent = this.agents.get('conversational');
    if (fallbackAgent && fallbackAgent.isActive) {
      try {
        return await this.executeWithAgent(fallbackAgent, query, context, options);
      } catch (error) {
        console.error('Fallback execution failed:', error);
      }
    }
    return null;
  }

  private recordQueryResult(
    queryId: string,
    agentId: string,
    query: string,
    success: boolean,
    responseTime: number
  ): void {
    // Update agent performance
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.performance.totalQueries++;
      agent.performance.lastUsed = new Date();
      
      if (success) {
        agent.performance.successRate = 
          (agent.performance.successRate * (agent.performance.totalQueries - 1) + 1) / agent.performance.totalQueries;
      } else {
        agent.performance.errorCount++;
        agent.performance.successRate = 
          (agent.performance.successRate * (agent.performance.totalQueries - 1)) / agent.performance.totalQueries;
      }
      
      agent.performance.averageResponseTime = 
        (agent.performance.averageResponseTime * (agent.performance.totalQueries - 1) + responseTime) / agent.performance.totalQueries;
    }

    // Record in history
    this.queryHistory.push({
      query,
      agentId,
      success,
      responseTime,
      timestamp: new Date()
    });

    // Keep history limited
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-500);
    }
  }

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  public getAgents(): SpecializedAgent[] {
    return Array.from(this.agents.values());
  }

  public getAgentById(id: string): SpecializedAgent | undefined {
    return this.agents.get(id);
  }

  public async activateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isActive = true;
      await agent.agent.initialize();
    }
  }

  public deactivateAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isActive = false;
    }
  }

  public getPerformanceMetrics(): {
    totalQueries: number;
    averageResponseTime: number;
    successRate: number;
    agentUsage: Record<string, number>;
  } {
    const totalQueries = this.queryHistory.length;
    const successfulQueries = this.queryHistory.filter(q => q.success).length;
    const averageResponseTime = this.queryHistory.reduce((sum, q) => sum + q.responseTime, 0) / totalQueries;
    
    const agentUsage: Record<string, number> = {};
    for (const query of this.queryHistory) {
      agentUsage[query.agentId] = (agentUsage[query.agentId] || 0) + 1;
    }

    return {
      totalQueries,
      averageResponseTime: averageResponseTime || 0,
      successRate: totalQueries > 0 ? successfulQueries / totalQueries : 0,
      agentUsage
    };
  }

  public async collaborateAgents(
    query: string,
    agentIds: string[],
    context: any = {},
    options: any = {}
  ): Promise<ExecutionResult> {
    // Multi-agent collaboration workflow
    const results: ExecutionResult[] = [];
    
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (agent && agent.isActive) {
        try {
          const result = await this.executeWithAgent(agent, query, context, options);
          results.push(result);
        } catch (error) {
          console.error(`Collaboration failed for agent ${agentId}:`, error);
        }
      }
    }

    // Synthesize results
    return this.synthesizeCollaborationResults(results);
  }

  private synthesizeCollaborationResults(results: ExecutionResult[]): ExecutionResult {
    // Combine results from multiple agents
    const combinedFindings = results.flatMap(r => r.findings || []);
    const combinedSources = results.flatMap(r => r.sources || []);
    
    return {
      query: results[0]?.query || '',
      findings: combinedFindings,
      sources: combinedSources,
      synthesis: this.createSynthesis(results),
      confidence: this.calculateCombinedConfidence(results),
      steps: results.flatMap(r => r.steps || [])
    };
  }

  private createSynthesis(results: ExecutionResult[]): string {
    const syntheses = results.map(r => r.synthesis).filter(s => s);
    return syntheses.join('\n\n--- Agent Perspective ---\n\n');
  }

  private calculateCombinedConfidence(results: ExecutionResult[]): number {
    const confidences = results.map(r => r.confidence).filter(c => c !== undefined);
    return confidences.length > 0 ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : 0;
  }
} 