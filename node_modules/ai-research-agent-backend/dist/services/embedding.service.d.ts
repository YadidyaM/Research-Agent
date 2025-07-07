export declare class EmbeddingService {
    private provider;
    private model;
    private apiKey?;
    private hfClient?;
    constructor(provider: string, model: string, apiKey?: string);
    generateEmbedding(text: string): Promise<number[]>;
    generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
    private generateHuggingFaceEmbedding;
    private generateOpenAIEmbedding;
    calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number>;
    findMostSimilar(queryEmbedding: number[], candidateEmbeddings: number[][]): Promise<{
        index: number;
        similarity: number;
    }>;
    chunkText(text: string, maxChunkSize?: number, overlap?: number): Promise<string[]>;
    preprocessText(text: string): Promise<string>;
    getDimensions(): number;
    validateEmbedding(embedding: number[]): Promise<boolean>;
}
//# sourceMappingURL=embedding.service.d.ts.map