"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const simple_agent_runner_1 = require("./core/simple-agent.runner");
const llm_service_1 = require("./services/llm.service");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)(config_1.config.cors));
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('dev'));
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        services: {
            llm: config_1.config.llm.provider,
            vectorDb: config_1.config.vectorDb.type,
            embedding: config_1.config.embedding.provider
        }
    });
});
const agentRunner = new simple_agent_runner_1.SimpleAgentRunner();
app.post('/api/agent/chat', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        const llmService = new llm_service_1.LLMService({
            provider: config_1.config.llm.provider,
            endpoint: config_1.config.llm.ollamaEndpoint,
            apiKey: config_1.config.llm.provider === 'openai' ? config_1.config.llm.openaiApiKey : config_1.config.llm.huggingfaceApiKey,
            model: config_1.config.llm.provider === 'ollama' ? config_1.config.llm.ollamaModel : config_1.config.llm.openaiModel,
        });
        const response = await llmService.basicChat(query);
        res.json({ response });
    }
    catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Chat request failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
app.post('/api/agent/research', async (req, res) => {
    try {
        const { query, stream } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        if (stream) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });
            agentRunner.setProgressCallback((step) => {
                res.write(`data: ${JSON.stringify({ type: 'step', data: step })}\n\n`);
            });
            try {
                const result = await agentRunner.executeTask({
                    type: 'research',
                    query,
                    options: req.body.options
                });
                res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
                res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                res.end();
            }
            catch (error) {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    data: {
                        error: 'Research task failed',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    }
                })}\n\n`);
                res.end();
            }
        }
        else {
            const result = await agentRunner.executeTask({
                type: 'research',
                query,
                options: req.body.options
            });
            res.json(result);
        }
    }
    catch (error) {
        console.error('Research error:', error);
        res.status(500).json({
            error: 'Research task failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
const port = config_1.config.port;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Configuration:', {
        environment: config_1.config.nodeEnv,
        llmProvider: config_1.config.llm.provider,
        vectorDb: config_1.config.vectorDb.type,
        embedding: config_1.config.embedding.provider
    });
});
//# sourceMappingURL=server.js.map