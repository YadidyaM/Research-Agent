import dotenv from 'dotenv';
import { AgentConfig } from '../types';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // LLM Configuration - Multi-provider support
  llm: {
    provider: process.env.LLM_PROVIDER || 'deepseek',
    // DeepSeek Configuration
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
    // OpenAI Configuration
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    // HuggingFace Configuration
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    // Ollama Configuration
    ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama2',
    ollamaHost: process.env.OLLAMA_HOST || 'localhost:11434',
  },
  
  // Vector Database Configuration
  vectorDb: {
    type: process.env.VECTOR_DB_TYPE || 'chroma',
    chromaEndpoint: process.env.CHROMA_ENDPOINT || 'http://localhost:8000',
    collectionName: process.env.COLLECTION_NAME || 'research_agent_memory',
    // FAISS-specific configuration
    dimension: process.env.VECTOR_DB_DIMENSION ? parseInt(process.env.VECTOR_DB_DIMENSION) : undefined,
    metric: process.env.VECTOR_DB_METRIC || 'l2',
    dataPath: process.env.VECTOR_DB_DATA_PATH || './data/faiss',
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
    nasa: {
      apiKey: process.env.NASA_API_KEY,
      timeout: parseInt(process.env.NASA_TIMEOUT || '30000'),
      userAgent: process.env.NASA_USER_AGENT || 'AI-Research-Agent/1.0',
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
    if (config.llm.provider === 'ollama') return undefined; // Ollama typically doesn't need API key
    return config.llm.huggingfaceApiKey;
  };

  const getEndpoint = () => {
    if (config.llm.provider === 'deepseek') return config.llm.deepseekBaseUrl;
    if (config.llm.provider === 'ollama') return config.llm.ollamaEndpoint;
    return undefined;
  };

  const getModel = () => {
    if (config.llm.provider === 'deepseek') return config.llm.deepseekModel;
    if (config.llm.provider === 'openai') return config.llm.openaiModel;
    if (config.llm.provider === 'ollama') return config.llm.ollamaModel;
    return config.llm.openaiModel; // fallback
  };

  return {
    llmProvider: {
      name: config.llm.provider,
      ...(getEndpoint() && { endpoint: getEndpoint() }),
      ...(getApiKey() && { apiKey: getApiKey() }),
      model: getModel(),
    },
    vectorDb: {
      type: config.vectorDb.type as 'chroma' | 'faiss',
      ...(config.vectorDb.chromaEndpoint && { endpoint: config.vectorDb.chromaEndpoint }),
      collectionName: config.vectorDb.collectionName,
      ...(config.vectorDb.dimension && { dimension: config.vectorDb.dimension }),
      ...(config.vectorDb.metric && { metric: config.vectorDb.metric }),
      ...(config.vectorDb.dataPath && { dataPath: config.vectorDb.dataPath }),
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
      nasa: {
        ...(config.tools.nasa.apiKey && { apiKey: config.tools.nasa.apiKey }),
        timeout: config.tools.nasa.timeout,
        userAgent: config.tools.nasa.userAgent,
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