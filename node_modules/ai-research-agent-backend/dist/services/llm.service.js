"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const inference_1 = require("@huggingface/inference");
const axios_1 = __importDefault(require("axios"));
const prompts_1 = require("../config/prompts");
class LLMService {
    constructor(config) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hfClient", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = config;
        if (config.provider === 'huggingface' && config.apiKey) {
            this.hfClient = new inference_1.HfInference(config.apiKey);
        }
    }
    async generateText(prompt, options = {}) {
        switch (this.config.provider) {
            case 'ollama':
                return this.generateWithOllama(prompt, options);
            case 'openai':
                return this.generateWithOpenAI(prompt, options);
            case 'huggingface':
                return this.generateWithHuggingFace(prompt, options);
            default:
                throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
        }
    }
    async generateWithOllama(prompt, options) {
        const response = await fetch(`${this.config.endpoint}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                prompt: options.system ? `${options.system}\n\n${prompt}` : prompt,
                stream: false,
                options: {
                    temperature: options.temperature ?? 0.7,
                    num_predict: options.maxTokens,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.response;
    }
    async generateWithOpenAI(prompt, options) {
        const messages = [];
        if (options.system) {
            messages.push({ role: 'system', content: options.system });
        }
        messages.push({ role: 'user', content: prompt });
        const payload = {
            model: this.config.model,
            messages: messages,
            max_tokens: options.maxTokens,
            temperature: options.temperature ?? 0.7,
        };
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            timeout: 60000,
        });
        if (!response.data.choices || response.data.choices.length === 0) {
            throw new Error('No response from OpenAI');
        }
        return response.data.choices[0].message.content;
    }
    async generateWithHuggingFace(prompt, options) {
        if (!this.hfClient) {
            throw new Error('HuggingFace client not initialized');
        }
        const response = await this.hfClient.textGeneration({
            model: this.config.model,
            inputs: prompt,
            parameters: {
                max_new_tokens: options.maxTokens,
                temperature: options.temperature ?? 0.7,
                return_full_text: false,
            },
        });
        return response.generated_text;
    }
    async createChatCompletion(messages, options = {}) {
        const { maxTokens = 1000, temperature = 0.7 } = options;
        const prompt = messages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
        return await this.generateText(prompt, { maxTokens, temperature });
    }
    async generateResearchPlan(query) {
        const prompt = prompts_1.PROMPT_TEMPLATES.RESEARCH_PLAN(query);
        const config = prompts_1.PROMPT_CONFIG.DEFAULTS.RESEARCH_PLAN;
        return this.generateText(prompt, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
    }
    async isContentRelevant(content, query) {
        const prompt = prompts_1.PROMPT_TEMPLATES.RELEVANCE_CHECK(query, content);
        const config = prompts_1.PROMPT_CONFIG.DEFAULTS.RELEVANCE_CHECK;
        const response = await this.generateText(prompt, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
        return response.toLowerCase().includes('true');
    }
    async extractKeyPoints(content) {
        const prompt = prompts_1.PROMPT_TEMPLATES.EXTRACT_POINTS(content);
        const config = prompts_1.PROMPT_CONFIG.DEFAULTS.EXTRACT_POINTS;
        const response = await this.generateText(prompt, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
        return response
            .split('\n')
            .filter(line => line.trim().match(/^\d+\./))
            .map(point => point.replace(/^\d+\.\s*/, '').trim());
    }
    async synthesizeFindings(findings) {
        const prompt = prompts_1.PROMPT_TEMPLATES.SYNTHESIZE(findings);
        const config = prompts_1.PROMPT_CONFIG.DEFAULTS.SYNTHESIZE;
        return this.generateText(prompt, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
    }
    async basicChat(query) {
        const prompt = prompts_1.PROMPT_TEMPLATES.BASIC_CHAT(query);
        const config = prompts_1.PROMPT_CONFIG.DEFAULTS.BASIC_CHAT;
        return this.generateText(prompt, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
    }
    async optimizeSearchQuery(query) {
        const prompt = prompts_1.PROMPT_TEMPLATES.OPTIMIZE_SEARCH(query);
        const response = await this.generateText(prompt, {
            maxTokens: prompts_1.PROMPT_CONFIG.MAX_TOKENS.MEDIUM,
            temperature: prompts_1.PROMPT_CONFIG.TEMPERATURE.ANALYTICAL,
        });
        return response
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.trim());
    }
    async evaluateSourceCredibility(url, title, content) {
        const prompt = prompts_1.PROMPT_TEMPLATES.EVALUATE_SOURCE(url, title, content);
        const response = await this.generateText(prompt, {
            maxTokens: prompts_1.PROMPT_CONFIG.MAX_TOKENS.MEDIUM,
            temperature: prompts_1.PROMPT_CONFIG.TEMPERATURE.ANALYTICAL,
        });
        const scoreMatch = response.match(/(\d+)\/10|(\d+) out of 10|score:?\s*(\d+)/i);
        let score = 5;
        if (scoreMatch) {
            const scoreStr = scoreMatch[1] || scoreMatch[2] || scoreMatch[3] || '5';
            score = parseInt(scoreStr) || 5;
        }
        return {
            score: Math.min(Math.max(score, 1), 10),
            reasoning: response
        };
    }
}
exports.LLMService = LLMService;
//# sourceMappingURL=llm.service.js.map