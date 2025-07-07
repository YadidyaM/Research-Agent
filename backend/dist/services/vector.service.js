"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorService = void 0;
const chromadb_1 = require("chromadb");
const uuid_1 = require("uuid");
class VectorService {
    constructor(endpoint, collectionName) {
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "collection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "collectionName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.client = new chromadb_1.ChromaClient({ path: endpoint });
        this.collectionName = collectionName;
    }
    async initialize() {
        try {
            try {
                this.collection = await this.client.getCollection({
                    name: this.collectionName,
                });
                console.log(`Connected to existing collection: ${this.collectionName}`);
            }
            catch (error) {
                this.collection = await this.client.createCollection({
                    name: this.collectionName,
                    metadata: {
                        description: 'AI Research Agent Memory Store',
                        created_at: new Date().toISOString(),
                    },
                });
                console.log(`Created new collection: ${this.collectionName}`);
            }
            this.isInitialized = true;
        }
        catch (error) {
            console.error('Failed to initialize vector database:', error);
            throw new Error(`Vector database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    ensureInitialized() {
        if (!this.isInitialized || !this.collection) {
            throw new Error('Vector service not initialized. Call initialize() first.');
        }
    }
    async addDocument(chunk) {
        this.ensureInitialized();
        try {
            await this.collection.add({
                ids: [chunk.id],
                embeddings: [chunk.embedding],
                documents: [chunk.content],
                metadatas: [chunk.metadata],
            });
            console.log(`Added document to vector store: ${chunk.id}`);
        }
        catch (error) {
            console.error('Failed to add document to vector store:', error);
            throw new Error(`Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async addDocuments(chunks) {
        this.ensureInitialized();
        if (chunks.length === 0) {
            return;
        }
        try {
            const ids = chunks.map(chunk => chunk.id);
            const embeddings = chunks.map(chunk => chunk.embedding);
            const documents = chunks.map(chunk => chunk.content);
            const metadatas = chunks.map(chunk => chunk.metadata);
            await this.collection.add({
                ids,
                embeddings,
                documents,
                metadatas,
            });
            console.log(`Added ${chunks.length} documents to vector store`);
        }
        catch (error) {
            console.error('Failed to add documents to vector store:', error);
            throw new Error(`Failed to add documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async search(queryEmbedding, options = {}) {
        this.ensureInitialized();
        const { limit = 10, threshold = 0.0, where } = options;
        try {
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit,
                where: where,
                include: [chromadb_1.IncludeEnum.Documents, chromadb_1.IncludeEnum.Metadatas, chromadb_1.IncludeEnum.Distances],
            });
            if (!results.ids || !results.documents || !results.metadatas || !results.distances) {
                return [];
            }
            const searchResults = [];
            for (let i = 0; i < results.ids[0].length; i++) {
                const distance = results.distances[0][i];
                const similarity = 1 - distance;
                if (similarity >= threshold) {
                    searchResults.push({
                        id: results.ids[0][i],
                        content: results.documents[0][i],
                        metadata: results.metadatas[0][i],
                        similarity,
                    });
                }
            }
            return searchResults.sort((a, b) => b.similarity - a.similarity);
        }
        catch (error) {
            console.error('Failed to search vector store:', error);
            throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async searchByText(queryText, embedding, options = {}) {
        const { source, type, ...searchOptions } = options;
        const where = {};
        if (source)
            where.source = source;
        if (type)
            where.type = type;
        return await this.search(embedding, {
            ...searchOptions,
            where: Object.keys(where).length > 0 ? where : undefined,
        });
    }
    async getDocument(id) {
        this.ensureInitialized();
        try {
            const results = await this.collection.get({
                ids: [id],
                include: [chromadb_1.IncludeEnum.Documents, chromadb_1.IncludeEnum.Metadatas, chromadb_1.IncludeEnum.Embeddings],
            });
            if (!results.ids || results.ids.length === 0) {
                return null;
            }
            return {
                id: results.ids[0],
                content: results.documents[0],
                embedding: results.embeddings[0],
                metadata: results.metadatas[0],
            };
        }
        catch (error) {
            console.error('Failed to get document from vector store:', error);
            throw new Error(`Failed to get document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async updateDocument(id, updates) {
        this.ensureInitialized();
        try {
            const updateData = { ids: [id] };
            if (updates.content) {
                updateData.documents = [updates.content];
            }
            if (updates.embedding) {
                updateData.embeddings = [updates.embedding];
            }
            if (updates.metadata) {
                updateData.metadatas = [updates.metadata];
            }
            await this.collection.update(updateData);
            console.log(`Updated document: ${id}`);
        }
        catch (error) {
            console.error('Failed to update document in vector store:', error);
            throw new Error(`Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async deleteDocument(id) {
        this.ensureInitialized();
        try {
            await this.collection.delete({
                ids: [id],
            });
            console.log(`Deleted document: ${id}`);
        }
        catch (error) {
            console.error('Failed to delete document from vector store:', error);
            throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async deleteDocuments(ids) {
        this.ensureInitialized();
        if (ids.length === 0) {
            return;
        }
        try {
            await this.collection.delete({
                ids,
            });
            console.log(`Deleted ${ids.length} documents`);
        }
        catch (error) {
            console.error('Failed to delete documents from vector store:', error);
            throw new Error(`Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async clearCollection() {
        this.ensureInitialized();
        try {
            await this.client.deleteCollection({ name: this.collectionName });
            this.collection = await this.client.createCollection({
                name: this.collectionName,
                metadata: {
                    description: 'AI Research Agent Memory Store',
                    created_at: new Date().toISOString(),
                },
            });
            console.log(`Cleared and recreated collection: ${this.collectionName}`);
        }
        catch (error) {
            console.error('Failed to clear collection:', error);
            throw new Error(`Failed to clear collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getCollectionInfo() {
        this.ensureInitialized();
        try {
            const count = await this.collection.count();
            return {
                name: this.collectionName,
                count,
                metadata: this.collection.metadata,
            };
        }
        catch (error) {
            console.error('Failed to get collection info:', error);
            throw new Error(`Failed to get collection info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async findSimilarDocuments(docId, options = {}) {
        this.ensureInitialized();
        const { limit = 5, threshold = 0.7, excludeSelf = true } = options;
        try {
            const doc = await this.getDocument(docId);
            if (!doc) {
                throw new Error(`Document ${docId} not found`);
            }
            const results = await this.search(doc.embedding, { limit: limit + 1, threshold });
            if (excludeSelf) {
                return results.filter(result => result.id !== docId).slice(0, limit);
            }
            return results.slice(0, limit);
        }
        catch (error) {
            console.error('Failed to find similar documents:', error);
            throw new Error(`Failed to find similar documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    generateId() {
        return (0, uuid_1.v4)();
    }
    async health() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            const info = await this.getCollectionInfo();
            return info.count >= 0;
        }
        catch (error) {
            console.error('Vector service health check failed:', error);
            return false;
        }
    }
}
exports.VectorService = VectorService;
//# sourceMappingURL=vector.service.js.map