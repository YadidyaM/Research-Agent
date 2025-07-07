"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentConfig = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    llm: {
        provider: process.env.LLM_PROVIDER || 'ollama',
        ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
        ollamaModel: process.env.OLLAMA_MODEL || 'llama2',
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    },
    vectorDb: {
        type: process.env.VECTOR_DB_TYPE || 'chroma',
        chromaEndpoint: process.env.CHROMA_ENDPOINT || 'http://localhost:8000',
        collectionName: process.env.COLLECTION_NAME || 'research_agent_memory',
    },
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
    },
    embedding: {
        provider: process.env.EMBEDDING_PROVIDER || 'huggingface',
        model: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
        huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
    },
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    },
};
const getAgentConfig = () => {
    return {
        llmProvider: {
            name: exports.config.llm.provider,
            endpoint: exports.config.llm.provider === 'ollama' ? exports.config.llm.ollamaEndpoint : undefined,
            apiKey: exports.config.llm.provider === 'openai' ? exports.config.llm.openaiApiKey : exports.config.llm.huggingfaceApiKey,
            model: exports.config.llm.provider === 'ollama' ? exports.config.llm.ollamaModel : exports.config.llm.openaiModel,
        },
        vectorDb: {
            type: exports.config.vectorDb.type,
            endpoint: exports.config.vectorDb.chromaEndpoint,
            collectionName: exports.config.vectorDb.collectionName,
        },
        tools: {
            webSearch: {
                provider: exports.config.tools.webSearch.provider,
                apiKey: exports.config.tools.webSearch.serpApiKey,
                tavilyApiKey: exports.config.tools.webSearch.tavilyApiKey,
            },
            scraper: {
                timeout: exports.config.tools.scraper.timeout,
                userAgent: exports.config.tools.scraper.userAgent,
            },
            python: {
                sandboxed: exports.config.tools.python.sandboxed,
                timeout: exports.config.tools.python.timeout,
            },
        },
        embedding: {
            provider: exports.config.embedding.provider,
            model: exports.config.embedding.model,
            apiKey: exports.config.embedding.huggingfaceApiKey || exports.config.embedding.openaiApiKey,
        },
    };
};
exports.getAgentConfig = getAgentConfig;
exports.default = exports.config;
//# sourceMappingURL=index.js.map