# AI Research Agent - Backend

A powerful, autonomous AI research agent built with TypeScript, featuring LLM integration, vector memory, and advanced toolchain capabilities.

## 👥 Developers

**Developed by:**

- **Yadidya Medepalli**
  - LinkedIn: [@yadidya-medepalli](https://www.linkedin.com/in/yadidya-medepalli/)
  - GitHub: [@YadidyaM](https://github.com/YadidyaM)

- **Monia Jayakumar**
  - LinkedIn: [@monicajayakumar](https://www.linkedin.com/in/monicajayakumar/)
  - GitHub: [@Monica2403](https://github.com/Monica2403)

## 🚀 Features

- **Multi-LLM Support**: Ollama, OpenAI, HuggingFace
- **Advanced RAG**: ChromaDB vector memory with embeddings
- **Comprehensive Toolchain**:
  - Web Search (SerpAPI, DuckDuckGo)
  - Web Scraping (Playwright + Readability)
  - Python Code Execution (Sandboxed)
  - Memory Management (Vector-based)
- **Task Types**: Research, Analysis, Synthesis
- **Scalable Architecture**: Modular, extensible design

## 📋 Prerequisites

- Node.js 18+
- TypeScript 5+
- ChromaDB (for vector storage)
- Ollama (for local LLM) OR OpenAI/HuggingFace API keys

## 🛠 Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp env-config.template .env
   # Edit .env with your configuration
   ```

3. **Set up ChromaDB**
   ```bash
   # Install ChromaDB
   pip install chromadb
   
   # Start ChromaDB server
   chroma run --host localhost --port 8000
   ```

4. **Set up Ollama (Optional)**
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull a model
   ollama pull llama2
   
   # Start Ollama
   ollama serve
   ```

## ⚙️ Configuration

### Required Environment Variables

```bash
# LLM Configuration
LLM_PROVIDER=ollama  # or openai, huggingface
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama2

# Vector Database
CHROMA_ENDPOINT=http://localhost:8000
COLLECTION_NAME=research_agent_memory

# Embedding Service
EMBEDDING_PROVIDER=huggingface
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
HUGGINGFACE_API_KEY=your_key_here
```

### Optional API Keys

```bash
# For enhanced web search
SERP_API_KEY=your_serpapi_key

# For OpenAI LLM/Embeddings
OPENAI_API_KEY=your_openai_key
```

## 🏃‍♂️ Running the Server

```bash
# Development mode
npm run dev

# Build and run
npm run build
npm start

# Run tests
npm test
```

## 🔧 API Endpoints

### Research Task
```http
POST /api/agent/research
Content-Type: application/json

{
  "query": "Latest developments in quantum computing"
}
```

### Analysis Task
```http
POST /api/agent/analysis
Content-Type: application/json

{
  "query": "Analyze the performance data from recent experiments"
}
```

### Synthesis Task
```http
POST /api/agent/synthesis
Content-Type: application/json

{
  "query": "Synthesize findings on AI safety research"
}
```

### Task Status
```http
GET /api/agent/tasks/{taskId}
```

### Memory Search
```http
POST /api/memory/search
Content-Type: application/json

{
  "query": "machine learning trends",
  "limit": 10,
  "threshold": 0.7
}
```

### Health Check
```http
GET /api/health
```

## 🧠 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Agent Runner  │────│  Memory Store   │────│ Vector Service  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   LLM Service   │    │ Embedding Svc   │    │   ChromaDB      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Tool Chain                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │ Web Search  │ │   Scraper   │ │   Python    │ │  Memory   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🎯 Core Components

### LLM Service (`src/services/llm.service.ts`)
- Multi-provider LLM integration
- Research planning and synthesis
- Content analysis and extraction

### Vector Service (`src/services/vector.service.ts`)
- ChromaDB integration
- Semantic search and similarity
- Memory management

### Agent Runner (`src/core/agent.runner.ts`)
- Task orchestration
- Tool coordination
- Execution flow management

### Memory Store (`src/core/memory.store.ts`)
- Experience storage
- Research result caching
- Conversation history

### Tools
- **WebSearchTool**: Multi-provider web search
- **ScraperTool**: Content extraction with Playwright
- **PythonExecutorTool**: Safe code execution
- **MemoryTool**: Vector memory operations

## 📊 Usage Examples

### Research Task Flow
1. **Memory Search**: Check existing knowledge
2. **Planning**: Generate research strategy
3. **Web Search**: Find relevant sources
4. **Scraping**: Extract content from sources
5. **Analysis**: Process and synthesize findings
6. **Storage**: Save results to memory

### Memory Management
```typescript
// Store research findings
await memoryStore.storeResearchResult({
  query: "AI safety",
  findings: ["Finding 1", "Finding 2"],
  summary: "Research summary",
  sources: ["url1", "url2"],
  confidence: 0.85
});

// Search similar research
const similar = await memoryStore.getSimilarResearch("AI alignment");

// Get memory statistics
const stats = await memoryStore.getMemoryStats();
```

### Tool Usage
```typescript
// Web search
const searchResults = await webSearchTool.execute({
  query: "quantum computing",
  maxResults: 10
});

// Content scraping
const content = await scraperTool.execute({
  url: "https://example.com/article"
});

// Python analysis
const analysis = await pythonTool.executeDataAnalysis(
  data, 
  "descriptive_stats"
);
```

## 🔒 Security

- Sandboxed Python execution
- Input validation and sanitization
- Rate limiting
- CORS protection
- Environment variable security

## 📈 Performance

- Parallel tool execution
- Efficient vector search
- Memory consolidation
- Configurable timeouts
- Health monitoring

## 🐛 Troubleshooting

### Common Issues

1. **ChromaDB Connection Error**
   ```bash
   # Ensure ChromaDB is running
   chroma run --host localhost --port 8000
   ```

2. **Ollama Model Not Found**
   ```bash
   # Pull the required model
   ollama pull llama2
   ```

3. **Memory Errors**
   ```bash
   # Clear vector database
   curl -X DELETE http://localhost:8000/api/v1/collections/research_agent_memory
   ```

### Debug Mode
```bash
NODE_ENV=development npm run dev
```

## 🚀 Deployment

### Docker (Recommended)
```bash
# Build and run with docker-compose
npm run docker:build
npm run docker:up
```

### Manual Deployment
1. Build the application: `npm run build`
2. Set production environment variables
3. Start ChromaDB in production mode
4. Run: `npm start`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Related Projects

- [ChromaDB](https://github.com/chroma-core/chroma)
- [Ollama](https://ollama.ai/)
- [LangChain](https://github.com/hwchase17/langchain)
- [Playwright](https://playwright.dev/)

---

**Built with ❤️ for autonomous AI research** 