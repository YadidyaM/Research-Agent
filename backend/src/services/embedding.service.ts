import { HfInference } from '@huggingface/inference';
import axios from 'axios';

export class EmbeddingService {
  private provider: string;
  private model: string;
  private apiKey?: string;
  private hfClient?: HfInference;

  constructor(provider: string, model: string, apiKey?: string) {
    this.provider = provider;
    this.model = model;
    this.apiKey = apiKey;
    
    if (provider === 'huggingface' && apiKey) {
      this.hfClient = new HfInference(apiKey);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      switch (this.provider) {
        case 'huggingface':
          return await this.generateHuggingFaceEmbedding(text);
        
        case 'openai':
          return await this.generateOpenAIEmbedding(text);
        
        default:
          throw new Error(`Unsupported embedding provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // For large batches, we might want to implement parallel processing
      const embeddings = await Promise.all(
        texts.map(text => this.generateEmbedding(text))
      );
      return embeddings;
    } catch (error) {
      console.error('Batch embedding generation error:', error);
      throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateHuggingFaceEmbedding(text: string): Promise<number[]> {
    if (!this.hfClient) {
      throw new Error('HuggingFace client not initialized');
    }

    try {
      const response = await this.hfClient.featureExtraction({
        model: this.model,
        inputs: text,
      });

      // HuggingFace returns different formats, normalize to number[]
      if (Array.isArray(response)) {
        if (Array.isArray(response[0])) {
          // If it's a 2D array, take the first row
          return response[0] as number[];
        } else {
          // If it's a 1D array, return as is
          return response as number[];
        }
      } else {
        throw new Error('Unexpected response format from HuggingFace');
      }
    } catch (error) {
      console.error('HuggingFace embedding error:', error);
      throw error;
    }
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not provided');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: this.model,
          input: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: 30000,
        }
      );

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('OpenAI embedding error:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    // Calculate cosine similarity
    const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0);
    const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
    const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  async findMostSimilar(queryEmbedding: number[], candidateEmbeddings: number[][]): Promise<{
    index: number;
    similarity: number;
  }> {
    let bestMatch = { index: -1, similarity: -1 };

    for (let i = 0; i < candidateEmbeddings.length; i++) {
      const similarity = await this.calculateSimilarity(queryEmbedding, candidateEmbeddings[i]);
      if (similarity > bestMatch.similarity) {
        bestMatch = { index: i, similarity };
      }
    }

    return bestMatch;
  }

  async chunkText(text: string, maxChunkSize: number = 500, overlap: number = 50): Promise<string[]> {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
      const chunk = words.slice(i, i + maxChunkSize).join(' ');
      chunks.push(chunk);
      
      // If this is the last chunk, break
      if (i + maxChunkSize >= words.length) {
        break;
      }
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  async preprocessText(text: string): Promise<string> {
    // Basic text preprocessing
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n+/g, ' ') // Replace line breaks with spaces
      .trim(); // Remove leading/trailing whitespace
  }

  getDimensions(): number {
    // Return expected dimensions based on model
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
        return 768; // Default fallback
    }
  }

  async validateEmbedding(embedding: number[]): Promise<boolean> {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length === 0) {
      return false;
    }

    // Check if all values are numbers
    return embedding.every(value => typeof value === 'number' && !isNaN(value));
  }
} 