import dotenv from 'dotenv';
import { AgentConfig } from '../types';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // LLM Configuration - DeepSeek focused
  llm: {
    provider: process.env.LLM_PROVIDER || 'deepseek',
    // DeepSeek Configuration
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
    // Keep OpenAI and HuggingFace as fallback options
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
  },
  
  // Vector Database Configuration
  vectorDb: {
    type: process.env.VECTOR_DB_TYPE || 'chroma',
    chromaEndpoint: process.env.CHROMA_ENDPOINT || 'http://localhost:8000',
    collectionName: process.env.COLLECTION_NAME || 'research_agent_memory',
  },
  
  // Tools Configuration
  tools: {
    webSearch: {
      provider: process.env.WEB_SEARCH_PROVIDER || 'tavily',
      serpApiKey: process.env.SERP_API_KEY,
      tavilyApiKey: process.env.TAVILY_API_KEY,
    },
    scraper: {
      timeout: parseInt(process.env.SCRAPER_TIMEOUT || '30000'),
      userAgent: process.env.USER_AGENT || 'AI Research Agent/1.0',
    },
    python: {
      sandboxed: process.env.PYTHON_SANDBOXED === 'true',
      timeout: parseInt(process.env.PYTHON_TIMEOUT || '30000'),
      endpoint: process.env.PYTHON_EXECUTOR_ENDPOINT || 'http://localhost:5000',
    },
    wikipedia: {
      language: process.env.WIKIPEDIA_LANGUAGE || 'en',
      timeout: parseInt(process.env.WIKIPEDIA_TIMEOUT || '30000'),
      userAgent: process.env.WIKIPEDIA_USER_AGENT || 'AI-Research-Agent/1.0 (research-agent@example.com)',
    },
  },
  
  // Agent Configuration
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10'),
    temperature: parseFloat(process.env.AGENT_TEMPERATURE || '0.1'),
    verbose: process.env.AGENT_VERBOSE === 'true',
    memorySize: parseInt(process.env.AGENT_MEMORY_SIZE || '10'),
    responseFormat: process.env.AGENT_RESPONSE_FORMAT || 'structured',
  },
  
  // Embedding Configuration
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'huggingface',
    model: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // limit each IP to 100 requests per windowMs
  },
};

export const getAgentConfig = (): AgentConfig => {
  const getApiKey = () => {
    if (config.llm.provider === 'openai') return config.llm.openaiApiKey;
    if (config.llm.provider === 'deepseek') return config.llm.deepseekApiKey;
    return config.llm.huggingfaceApiKey;
  };

  return {
    llmProvider: {
      name: config.llm.provider,
      ...(config.llm.provider === 'deepseek' && config.llm.deepseekBaseUrl && { endpoint: config.llm.deepseekBaseUrl }),
      ...(getApiKey() && { apiKey: getApiKey() }),
      model: config.llm.provider === 'deepseek' ? config.llm.deepseekModel : config.llm.openaiModel,
    },
    vectorDb: {
      type: config.vectorDb.type as 'chroma' | 'faiss',
      ...(config.vectorDb.chromaEndpoint && { endpoint: config.vectorDb.chromaEndpoint }),
      collectionName: config.vectorDb.collectionName,
    },
    tools: {
      webSearch: {
        provider: config.tools.webSearch.provider as 'tavily' | 'serpapi' | 'duckduckgo',
        ...(config.tools.webSearch.serpApiKey && { apiKey: config.tools.webSearch.serpApiKey }),
        ...(config.tools.webSearch.tavilyApiKey && { tavilyApiKey: config.tools.webSearch.tavilyApiKey }),
      },
      scraper: {
        timeout: config.tools.scraper.timeout,
        userAgent: config.tools.scraper.userAgent,
      },
      python: {
        sandboxed: config.tools.python.sandboxed,
        timeout: config.tools.python.timeout,
      },
      wikipedia: {
        language: config.tools.wikipedia.language,
        timeout: config.tools.wikipedia.timeout,
        userAgent: config.tools.wikipedia.userAgent,
      },
    },
    embedding: {
      provider: config.embedding.provider as 'huggingface' | 'openai',
      model: config.embedding.model,
      ...(config.embedding.huggingfaceApiKey || config.embedding.openaiApiKey) && { 
        apiKey: config.embedding.huggingfaceApiKey || config.embedding.openaiApiKey 
      },
    },
  };
};

export default config; 