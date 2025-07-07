import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { UnifiedAgent } from './core/UnifiedAgent';
import { AgentOrchestrator } from './core/AgentOrchestrator';
import { AgentStep } from './types';
import { LLMService } from './services/llm.service';
import { ServiceFactory } from './services/ServiceFactory';

const app = express();

// Middleware
app.use(express.json());
app.use(cors(config.cors));
app.use(helmet());
app.use(morgan('dev'));

// Initialize agent orchestrator
const orchestrator = new AgentOrchestrator({
  loadBalancingEnabled: true,
  maxConcurrentAgents: 5,
  routingStrategy: 'hybrid',
  enableCollaboration: true,
  enableFallback: true
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const researchHealth = await researchAgent.health();
    const chatHealth = await chatAgent.health();
    const orchestratorHealth = orchestrator.getPerformanceMetrics();
    
    res.json({ 
      status: 'ok',
      services: {
        llm: config.llm.provider,
        vectorDb: config.vectorDb.type,
        embedding: config.embedding.provider
      },
      agents: {
        research: researchHealth,
        chat: chatHealth,
        orchestrator: orchestratorHealth
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Initialize unified agents for different use cases
const researchAgent = UnifiedAgent.createResearchAgent();
const chatAgent = UnifiedAgent.createChatAgent();

// Intelligent Chat endpoint with agent orchestration
app.post('/api/chat', async (req, res) => {
  try {
    const { message, context = [], isFollowUp = false, mode = 'chat', preferredAgent = null } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build context-aware prompt
    let contextualMessage = message;
    
    if (context.length > 0) {
      const contextMessages = context.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n');
      
      if (isFollowUp) {
        contextualMessage = `Context from previous conversation:\n${contextMessages}\n\nCurrent message (this may reference the above context): ${message}`;
      } else {
        contextualMessage = `Previous conversation context:\n${contextMessages}\n\nNew message: ${message}`;
      }
    }

    // Use orchestrator to route query to optimal agent
    const result = await orchestrator.routeQuery(contextualMessage, context, {
      preferredAgent: preferredAgent,
      onStep: (step: AgentStep) => {
        // Could implement real-time step streaming here if needed
      }
    });

    res.json({ 
      response: result.synthesis || result.findings?.join(' ') || 'No response generated',
      contextUsed: context.length > 0,
      agentUsed: result.metadata?.agentId || 'auto-selected',
      confidence: result.confidence,
      executionTime: result.executionTime
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat request failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Intelligent Research endpoint with streaming and orchestration
app.post('/api/research', async (req, res) => {
  try {
    const { query, context = [], isFollowUp = false, mode = 'research', preferredAgent = 'research', enableCollaboration = false } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Build context-aware research query
    let contextualQuery = query;
    
    if (context.length > 0) {
      const contextMessages = context.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n');
      
      if (isFollowUp) {
        contextualQuery = `Previous conversation context:\n${contextMessages}\n\nFollow-up research query (this builds on the above context): ${query}`;
      } else {
        contextualQuery = `Previous conversation context:\n${contextMessages}\n\nNew research query: ${query}`;
      }
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    try {
      let result;
      
      if (enableCollaboration) {
        // Multi-agent collaboration for complex research
        result = await orchestrator.collaborateAgents(
          contextualQuery,
          ['research', 'analysis'],
          context,
          {
            onStep: (step: AgentStep) => {
              res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
            },
            onThought: (thought: string) => {
              res.write(`data: ${JSON.stringify({ type: 'thought', thought })}\n\n`);
            }
          }
        );
      } else {
        // Single agent execution with intelligent routing
        result = await orchestrator.routeQuery(
          contextualQuery,
          context,
          {
            preferredAgent: preferredAgent,
            onStep: (step) => {
              res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
            },
            onThought: (thought) => {
              res.write(`data: ${JSON.stringify({ type: 'thought', thought })}\n\n`);
            }
          }
        );
      }

      // Send final result
      res.write(`data: ${JSON.stringify({ 
        type: 'result', 
        result: {
          ...result,
          metadata: {
            ...result.metadata,
            contextUsed: context.length > 0,
            collaboration: enableCollaboration
          }
        }
      })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Research task failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Research error:', error);
    res.status(500).json({ 
      error: 'Research task failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Agent management endpoints
app.post('/api/agent/clear-memory', async (req, res) => {
  try {
    const { agent } = req.body;
    const targetAgent = agent === 'chat' ? chatAgent : researchAgent;
    
    targetAgent.clearMemory();
    res.json({ success: true, message: 'Memory cleared successfully' });
  } catch (error) {
    console.error('Clear memory error:', error);
    res.status(500).json({ 
      error: 'Failed to clear memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/agent/memory', async (req, res) => {
  try {
    const { agent } = req.query;
    const targetAgent = agent === 'chat' ? chatAgent : researchAgent;
    
    const memory = targetAgent.getMemory();
    res.json({ memory: memory.map(msg => ({
      type: msg._getType ? msg._getType() : msg.role,
      content: msg.content
    })) });
  } catch (error) {
    console.error('Get memory error:', error);
    res.status(500).json({ 
      error: 'Failed to get memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Legacy endpoint for backward compatibility
app.post('/api/agent/chat', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const response = await chatAgent.chat(query);
    res.json({ response });
  } catch (error) {
    console.error('Legacy chat error:', error);
    res.status(500).json({ 
      error: 'Chat request failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Legacy research endpoint
app.post('/api/agent/research', async (req, res) => {
  try {
    const { query, stream } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (stream) {
      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      try {
        const result = await researchAgent.execute(
          query,
          'research',
          {
            onStep: (step) => {
              res.write(`data: ${JSON.stringify({ type: 'step', data: step })}\n\n`);
            },
            onThought: (thought) => {
              res.write(`data: ${JSON.stringify({ type: 'thought', data: thought })}\n\n`);
            }
          }
        );

        res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          data: { 
            error: 'Research task failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          }
        })}\n\n`);
        res.end();
      }
    } else {
      const result = await researchAgent.execute(query, 'research');
      res.json(result);
    }
  } catch (error) {
    console.error('Legacy research error:', error);
    res.status(500).json({ 
      error: 'Research task failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Memory Management Endpoints
app.post('/api/memory/store', async (req, res) => {
  try {
    const { content, metadata } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const memoryTool = serviceFactory.getMemoryTool();
    const result = await memoryTool.execute({
      action: 'store',
      content,
      metadata: metadata || {}
    });

    res.json(result);
  } catch (error) {
    console.error('Memory store error:', error);
    res.status(500).json({ 
      error: 'Failed to store memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/memory/search', async (req, res) => {
  try {
    const { query, limit, threshold, type, source } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const memoryTool = serviceFactory.getMemoryTool();
    const results = await memoryTool.execute({
      action: 'search',
      query,
      limit: limit || 10,
      threshold: threshold || 0.5,
      ...(type && { type }),
      ...(source && { source })
    });

    res.json({ results });
  } catch (error) {
    console.error('Memory search error:', error);
    res.status(500).json({ 
      error: 'Failed to search memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/memory/insights', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const insights = await serviceFactory.getMemoryInsights();
    res.json(insights);
  } catch (error) {
    console.error('Memory insights error:', error);
    res.status(500).json({ 
      error: 'Failed to get memory insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/memory/optimize', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const result = await serviceFactory.optimizeMemoryStorage();
    res.json(result);
  } catch (error) {
    console.error('Memory optimization error:', error);
    res.status(500).json({ 
      error: 'Failed to optimize memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/memory/import', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const result = await serviceFactory.importMemoryData(data);
    res.json(result);
  } catch (error) {
    console.error('Memory import error:', error);
    res.status(500).json({ 
      error: 'Failed to import memory data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/memory/export', async (req, res) => {
  try {
    const { format } = req.query;
    
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const exportData = await serviceFactory.exportMemoryData(format as 'json' | 'text');
    
    const contentType = format === 'text' ? 'text/plain' : 'application/json';
    const filename = `memory_export_${new Date().toISOString().split('T')[0]}.${format === 'text' ? 'txt' : 'json'}`;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    console.error('Memory export error:', error);
    res.status(500).json({ 
      error: 'Failed to export memory data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.delete('/api/memory/clear', async (req, res) => {
  try {
    const { type, source, confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ error: 'Confirmation required for memory clearing' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const result = await serviceFactory.clearMemoryData({ type, source, confirm });
    res.json(result);
  } catch (error) {
    console.error('Memory clear error:', error);
    res.status(500).json({ 
      error: 'Failed to clear memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cache endpoints
app.get('/api/cache/stats', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    const stats = await cacheService.getDetailedStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get cache stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/cache/info', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    const info = await cacheService.info();
    
    res.json(info);
  } catch (error) {
    console.error('Cache info error:', error);
    res.status(500).json({ 
      error: 'Failed to get cache info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/cache/health', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    const health = await cacheService.healthCheck();
    
    res.json(health);
  } catch (error) {
    console.error('Cache health check error:', error);
    res.status(500).json({ 
      error: 'Failed to check cache health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/cache/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ error: 'Confirmation required for cache clearing' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    await cacheService.clear();
    
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({ 
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/cache/invalidate', async (req, res) => {
  try {
    const { pattern, tag } = req.body;
    
    if (!pattern && !tag) {
      return res.status(400).json({ error: 'Pattern or tag is required' });
    }

    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    let invalidatedCount = 0;
    
    if (pattern) {
      invalidatedCount = await cacheService.invalidateByPattern(pattern);
    } else if (tag) {
      invalidatedCount = await cacheService.invalidateByTag(tag);
    }
    
    res.json({ 
      success: true, 
      invalidatedCount,
      message: `Invalidated ${invalidatedCount} cache entries` 
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    res.status(500).json({ 
      error: 'Failed to invalidate cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/cache/warmup', async (req, res) => {
  try {
    const { type } = req.body;
    
    const serviceFactory = ServiceFactory.getInstance();
    if (!serviceFactory.isServiceInitialized()) {
      await serviceFactory.initialize();
    }
    
    const cacheService = serviceFactory.getCacheService();
    
    switch (type) {
      case 'llm':
        await cacheService.warmUpLLMCache();
        break;
      case 'embedding':
        await cacheService.warmUpEmbeddingCache();
        break;
      case 'websearch':
        await cacheService.warmUpWebSearchCache();
        break;
      default:
        return res.status(400).json({ error: 'Invalid warmup type. Use: llm, embedding, websearch' });
    }
    
    res.json({ 
      success: true, 
      message: `${type} cache warmed up successfully` 
    });
  } catch (error) {
    console.error('Cache warmup error:', error);
    res.status(500).json({ 
      error: 'Failed to warm up cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Service health endpoint
app.get('/api/services/health', async (req, res) => {
  try {
    const serviceFactory = ServiceFactory.getInstance();
    let health;
    
    if (serviceFactory.isServiceInitialized()) {
      health = await serviceFactory.getServiceHealth();
    } else {
      health = {
        vectorService: false,
        embeddingService: false,
        memoryTool: false,
        overall: false
      };
    }

    const serviceInfo = serviceFactory.getServiceInfo();
    
    res.json({
      ...health,
      serviceInfo
    });
  } catch (error) {
    console.error('Service health check error:', error);
    res.status(500).json({ 
      error: 'Failed to check service health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Agent Orchestration Management Endpoints

// Get all agents and their status
app.get('/api/orchestrator/agents', async (req, res) => {
  try {
    const agents = orchestrator.getAgents();
    const agentsData = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      isActive: agent.isActive,
      loadFactor: agent.loadFactor,
      capabilities: agent.capabilities,
      performance: agent.performance
    }));
    
    res.json({ agents: agentsData });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ 
      error: 'Failed to get agents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific agent details
app.get('/api/orchestrator/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = orchestrator.getAgentById(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ 
      error: 'Failed to get agent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Activate/deactivate agent
app.post('/api/orchestrator/agents/:agentId/:action', async (req, res) => {
  try {
    const { agentId, action } = req.params;
    
    if (!['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "activate" or "deactivate"' });
    }
    
    if (action === 'activate') {
      await orchestrator.activateAgent(agentId);
    } else {
      orchestrator.deactivateAgent(agentId);
    }
    
    res.json({ success: true, message: `Agent ${agentId} ${action}d successfully` });
  } catch (error) {
    console.error('Agent action error:', error);
    res.status(500).json({ 
      error: `Failed to ${req.params.action} agent`,
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get orchestrator performance metrics
app.get('/api/orchestrator/metrics', async (req, res) => {
  try {
    const metrics = orchestrator.getPerformanceMetrics();
    res.json({ metrics });
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to get metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Multi-agent collaboration endpoint
app.post('/api/orchestrator/collaborate', async (req, res) => {
  try {
    const { query, agentIds, context = [], options = {} } = req.body;
    
    if (!query || !agentIds || !Array.isArray(agentIds)) {
      return res.status(400).json({ error: 'Query and agentIds array are required' });
    }
    
    // Set up Server-Sent Events for collaboration
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    try {
      const result = await orchestrator.collaborateAgents(
        query,
        agentIds,
        context,
        {
          onStep: (step: AgentStep) => {
            res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
          },
          onThought: (thought: string) => {
            res.write(`data: ${JSON.stringify({ type: 'thought', thought })}\n\n`);
          },
          ...options
        }
      );
      
      res.write(`data: ${JSON.stringify({ type: 'result', result })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Collaboration failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Collaboration error:', error);
    res.status(500).json({ 
      error: 'Collaboration request failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Smart routing endpoint (analyze query without executing)
app.post('/api/orchestrator/analyze', async (req, res) => {
  try {
    const { query, context = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // This would analyze the query and return recommended agents
    // For now, we'll return a simplified analysis
    const agents = orchestrator.getAgents();
    const activeAgents = agents.filter(agent => agent.isActive);
    
    res.json({
      query,
      recommendedAgents: activeAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        relevanceScore: Math.random(), // Simplified scoring
        capabilities: agent.capabilities,
        performance: agent.performance
      })).sort((a, b) => b.relevanceScore - a.relevanceScore)
    });
  } catch (error) {
    console.error('Query analysis error:', error);
    res.status(500).json({ 
      error: 'Query analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
const port = config.port;
app.listen(port, () => {
  console.log(`🚀 AI Research Agent Server running on port ${port}`);
  console.log('📊 Configuration:', {
    environment: config.nodeEnv,
    llmProvider: config.llm.provider,
    vectorDb: config.vectorDb.type,
    embedding: config.embedding.provider
  });
  console.log('🧠 Unified Agent Architecture initialized:');
  console.log('   - Research Agent (LangChain Strategy)');
  console.log('   - Chat Agent (Custom Strategy)');
  console.log('   - Auto-fallback enabled');
  console.log('   - Available tools: Web Search, Scraping, Memory, Python, PDF');
  console.log('   - Strategy switching supported');
  console.log('🔗 Endpoints:');
  console.log('   - POST /api/chat - Basic chat');
  console.log('   - POST /api/research - Research with streaming');
  console.log('   - GET /api/health - Health check');
  console.log('   - POST /api/agent/clear-memory - Clear agent memory');
  console.log('   - GET /api/agent/memory - Get agent memory');
  console.log('   - POST /api/memory/store - Store information in memory');
  console.log('   - POST /api/memory/search - Search memory');
  console.log('   - GET /api/memory/insights - Get memory insights');
  console.log('   - POST /api/memory/optimize - Optimize memory storage');
  console.log('   - GET /api/cache/stats - Get cache statistics');
  console.log('   - GET /api/cache/info - Get cache information');
  console.log('   - GET /api/cache/health - Check cache health');
  console.log('   - POST /api/cache/clear - Clear cache');
  console.log('   - POST /api/cache/invalidate - Invalidate cache by pattern/tag');
  console.log('   - POST /api/cache/warmup - Warm up cache');
  console.log('   - GET /api/orchestrator/agents - Get all agents and their status');
  console.log('   - GET /api/orchestrator/agents/:agentId - Get specific agent details');
  console.log('   - POST /api/orchestrator/agents/:agentId/:action - Activate/deactivate agent');
  console.log('   - GET /api/orchestrator/metrics - Get orchestrator performance metrics');
  console.log('   - POST /api/orchestrator/collaborate - Multi-agent collaboration');
  console.log('   - POST /api/orchestrator/analyze - Smart routing');
}); 