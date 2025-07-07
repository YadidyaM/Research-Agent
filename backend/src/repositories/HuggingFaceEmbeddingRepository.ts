import { HfInference } from '@huggingface/inference';
import { IEmbeddingRepository } from '../interfaces/repositories/IEmbeddingRepository';
import { ConfigurationManager } from '../config/ConfigurationManager';

export class HuggingFaceEmbeddingRepository implements IEmbeddingRepository {
  private client: HfInference | null = null;
  private configManager: ConfigurationManager;
  private model: string;
  private dimensions: number;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
    const config = this.configManager.getEmbeddingConfig();
    
    this.model = config.model;
    this.dimensions = config.dimensions || 768;
    
    if (config.apiKey) {
      this.client = new HfInference(config.apiKey);
    } else {
      // Initialize without API key for public models
      this.client = new HfInference();
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) {
      throw new Error('HuggingFace client not initialized');
    }

    try {
      const preprocessed = await this.preprocessText(text);
      
      const response = await this.client.featureExtraction({
        model: this.model,
        inputs: preprocessed
      });

      // Handle different response formats
      if (Array.isArray(response)) {
        if (Array.isArray(response[0])) {
          // 2D array - take first row
          return response[0] as number[];
        } else {
          // 1D array
          return response as number[];
        }
      }

      throw new Error('Unexpected response format from HuggingFace');
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.client) {
      throw new Error('HuggingFace client not initialized');
    }

    if (texts.length === 0) {
      return [];
    }

    try {
      const config = this.configManager.getEmbeddingConfig();
      const batchSize = config.batchSize || 10;
      const results: number[][] = [];

      // Process in batches to avoid rate limits
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const preprocessed = await Promise.all(batch.map(text => this.preprocessText(text)));
        
        const response = await this.client.featureExtraction({
          model: this.model,
          inputs: preprocessed
        });

        if (Array.isArray(response)) {
          if (Array.isArray(response[0])) {
            // 2D array - each row is an embedding
            results.push(...(response as number[][]));
          } else {
            // 1D array - single embedding
            results.push(response as number[]);
          }
        }

        // Add small delay between batches
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  async findMostSimilar(queryEmbedding: number[], candidateEmbeddings: number[][]): Promise<{
    index: number;
    similarity: number;
  }> {
    if (candidateEmbeddings.length === 0) {
      throw new Error('No candidate embeddings provided');
    }

    let maxSimilarity = -1;
    let bestIndex = -1;

    for (let i = 0; i < candidateEmbeddings.length; i++) {
      const similarity = await this.calculateSimilarity(queryEmbedding, candidateEmbeddings[i]);
      
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestIndex = i;
      }
    }

    return {
      index: bestIndex,
      similarity: maxSimilarity
    };
  }

  async chunkText(text: string, maxChunkSize: number = 500, overlap: number = 50): Promise<string[]> {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxChunkSize;
      
      // Try to break at word boundaries
      if (end < text.length) {
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > start) {
          end = spaceIndex;
        }
      }

      chunks.push(text.substring(start, end).trim());
      start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  async preprocessText(text: string): Promise<string> {
    // Basic text preprocessing
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,!?;:()]/g, '')
      .toLowerCase();
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async validateEmbedding(embedding: number[]): Promise<boolean> {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length !== this.dimensions) {
      return false;
    }

    // Check for valid numbers
    for (const value of embedding) {
      if (typeof value !== 'number' || !isFinite(value)) {
        return false;
      }
    }

    return true;
  }

  getProvider(): string {
    return 'huggingface';
  }

  getModel(): string {
    return this.model;
  }
} 