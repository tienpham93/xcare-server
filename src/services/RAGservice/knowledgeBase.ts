import { Knowledge, SearchResult } from "../../types";
import { logger } from "../../utils/logger";
import { OllamaEmbeddings } from "@langchain/ollama";
import fs from 'fs';
import path from 'path';
import { EMBEDDING_MODEL, ollamaPort } from "../../env";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

export class KnowledgeBase {
    private static instance: KnowledgeBase;
    private vectorStore: MemoryVectorStore | null = null;
    private embeddings: OllamaEmbeddings;

    private localStorePath: string = path.join(process.cwd(), '/.faiss_store/documents.json');

    private constructor() {
        this.embeddings = new OllamaEmbeddings({
            model: EMBEDDING_MODEL,
            baseUrl: `http://127.0.0.1:${ollamaPort}`,
        });
    }

    public static getInstance(): KnowledgeBase {
        if (!KnowledgeBase.instance) {
            KnowledgeBase.instance = new KnowledgeBase();
        }
        return KnowledgeBase.instance;
    }

    public async initializeKnowledgeBase(sourcePath: string): Promise<void> {
        try {
            // Load documents from the source path
            const files = await fs.promises.readdir(sourcePath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            let allKnowledge: Knowledge[] = [];
            
            for (const file of jsonFiles) {
                const filePath = path.join(sourcePath, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                allKnowledge = allKnowledge.concat(JSON.parse(content));
            }

            // Convert to LangChain Documents
            const langchainDocs = allKnowledge.map(k => new Document({
                pageContent: k.content,
                metadata: {
                    topic: k.topic,
                    category: k.category,
                    ...k.metadata
                }
            }));

            // Initialize MemoryVectorStore (or swap for FaissStore if persistence is needed immediately)
            this.vectorStore = await MemoryVectorStore.fromDocuments(
                langchainDocs,
                this.embeddings
            );

            // Save for compatibility/audit purposes
            try {
                await fs.promises.mkdir(path.dirname(this.localStorePath), { recursive: true });
                await fs.promises.writeFile(this.localStorePath, JSON.stringify(allKnowledge));
                logger.info('Saved the raw knowledge base for audit tracking');
            } catch (error) {
                logger.error('Failed to save the knowledge base to local storage:', error);
            }

            logger.info('Initialized the knowledge base with OllamaEmbeddings');
        } catch (error) {
            logger.error('Failed to initialize the knowledge base:', error);
            throw error;
        }
    }

    public async searchRelevant(text: string): Promise<SearchResult[] | null> {
        if (!this.vectorStore) {
            logger.error('Vector store not initialized');
            return null;
        }

        try {
            // Use similarity search with scores
            const results = await this.vectorStore.similaritySearchWithScore(text, 5);
            
            return results.map(([doc, score]) => ({
                topic: doc.metadata.topic as string,
                category: doc.metadata.category as string,
                content: doc.pageContent,
                similarity: 1 - score, // MemoryVectorStore uses distance, let's normalize to a "similarity" feel
                metadata: doc.metadata
            }));
        } catch (error) {
            logger.error('Error during similarity search:', error);
            return null;
        }
    }

    public async searchKnowledgeByTopic(topic: string, similarity: number = 1.0): Promise<SearchResult[] | null> {
        try {
            const documents = await fs.promises.readFile(this.localStorePath, 'utf-8');
            const jsonDocuments = JSON.parse(documents) as Knowledge[];

            const matchedDocs = jsonDocuments.filter((doc: Knowledge) => doc.topic === topic);
            
            return matchedDocs.map((doc: Knowledge): SearchResult => ({
                topic: doc.topic,
                category: doc.category,
                content: doc.content,
                similarity: similarity,
                metadata: doc.metadata
            }));
        } catch (error) {
            logger.error('Failed to search knowledge by topic:', error);
            return null;
        }
    }
}