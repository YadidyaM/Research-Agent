"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const inference_1 = require("@huggingface/inference");
const axios_1 = __importDefault(require("axios"));
class EmbeddingService {
    constructor(provider, model, apiKey) {
        Object.defineProperty(this, "provider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "model", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "apiKey", {
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
        this.provider = provider;
        this.model = model;
        this.apiKey = apiKey;
        if (provider === 'huggingface' && apiKey) {
            this.hfClient = new inference_1.HfInference(apiKey);
        }
    }
    async generateEmbedding(text) {
        try {
            switch (this.provider) {
                case 'huggingface':
                    return await this.generateHuggingFaceEmbedding(text);
                case 'openai':
                    return await this.generateOpenAIEmbedding(text);
                default:
                    throw new Error(`Unsupported embedding provider: ${this.provider}`);
            }
        }
        catch (error) {
            console.error('Embedding generation error:', error);
            throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateBatchEmbeddings(texts) {
        try {
            const embeddings = await Promise.all(texts.map(text => this.generateEmbedding(text)));
            return embeddings;
        }
        catch (error) {
            console.error('Batch embedding generation error:', error);
            throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateHuggingFaceEmbedding(text) {
        if (!this.hfClient) {
            throw new Error('HuggingFace client not initialized');
        }
        try {
            const response = await this.hfClient.featureExtraction({
                model: this.model,
                inputs: text,
            });
            if (Array.isArray(response)) {
                if (Array.isArray(response[0])) {
                    return response[0];
                }
                else {
                    return response;
                }
            }
            else {
                throw new Error('Unexpected response format from HuggingFace');
            }
        }
        catch (error) {
            console.error('HuggingFace embedding error:', error);
            throw error;
        }
    }
    async generateOpenAIEmbedding(text) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not provided');
        }
        try {
            const response = await axios_1.default.post('https://api.openai.com/v1/embeddings', {
                model: this.model,
                input: text,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                timeout: 30000,
            });
            if (!response.data.data || response.data.data.length === 0) {
                throw new Error('No embedding data received from OpenAI');
            }
            return response.data.data[0].embedding;
        }
        catch (error) {
            console.error('OpenAI embedding error:', error);
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
            }
            throw error;
        }
    }
    async calculateSimilarity(embedding1, embedding2) {
        if (embedding1.length !== embedding2.length) {
            throw new Error('Embeddings must have the same dimensions');
        }
        const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0);
        const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
        const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));
        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }
        return dotProduct / (magnitude1 * magnitude2);
    }
    async findMostSimilar(queryEmbedding, candidateEmbeddings) {
        let bestMatch = { index: -1, similarity: -1 };
        for (let i = 0; i < candidateEmbeddings.length; i++) {
            const similarity = await this.calculateSimilarity(queryEmbedding, candidateEmbeddings[i]);
            if (similarity > bestMatch.similarity) {
                bestMatch = { index: i, similarity };
            }
        }
        return bestMatch;
    }
    async chunkText(text, maxChunkSize = 500, overlap = 50) {
        const words = text.split(/\s+/);
        const chunks = [];
        for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
            const chunk = words.slice(i, i + maxChunkSize).join(' ');
            chunks.push(chunk);
            if (i + maxChunkSize >= words.length) {
                break;
            }
        }
        return chunks.filter(chunk => chunk.trim().length > 0);
    }
    async preprocessText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .trim();
    }
    getDimensions() {
        switch (this.model) {
            case 'sentence-transformers/all-MiniLM-L6-v2':
                return 384;
            case 'sentence-transformers/all-mpnet-base-v2':
                return 768;
            case 'text-embedding-ada-002':
                return 1536;
            case 'text-embedding-3-small':
                return 1536;
            case 'text-embedding-3-large':
                return 3072;
            default:
                return 768;
        }
    }
    async validateEmbedding(embedding) {
        if (!Array.isArray(embedding)) {
            return false;
        }
        if (embedding.length === 0) {
            return false;
        }
        return embedding.every(value => typeof value === 'number' && !isNaN(value));
    }
}
exports.EmbeddingService = EmbeddingService;
//# sourceMappingURL=embedding.service.js.map