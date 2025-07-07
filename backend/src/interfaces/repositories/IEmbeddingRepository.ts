export interface IEmbeddingRepository {
  // Core embedding operations
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  // Similarity calculations
  calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number>;
  findMostSimilar(queryEmbedding: number[], candidateEmbeddings: number[][]): Promise<{
    index: number;
    similarity: number;
  }>;

  // Text processing utilities
  chunkText(text: string, maxChunkSize?: number, overlap?: number): Promise<string[]>;
  preprocessText(text: string): Promise<string>;

  // Model information
  getDimensions(): number;
  validateEmbedding(embedding: number[]): Promise<boolean>;

  // Configuration
  getProvider(): string;
  getModel(): string;
} 