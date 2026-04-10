import { Knowledge, SearchResult } from "../../types";
import { logger } from "../../utils/logger";
import { OllamaEmbeddings } from "@langchain/ollama";
import fs from 'fs';
import path from 'path';
import { EMBEDDING_MODEL, ollamaPort } from "../../env";
import { Document } from "@langchain/core/documents";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PoolConfig } from "pg";
import prisma from "../prismaClient";
import { KnowledgeRule, Prisma } from "@prisma/client";

const pgVectorConfig: { postgresConnectionOptions: PoolConfig; tableName: string } = {
    postgresConnectionOptions: {
        host: process.env.PG_HOST || 'localhost',
        port: Number(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'password',
        database: process.env.PG_DB || 'xcare',
    } as PoolConfig,
    tableName: 'knowledge_embeddings',
};

export class KnowledgeBase {
    private static instance: KnowledgeBase;
    private vectorStore: PGVectorStore | null = null;
    private embeddings: OllamaEmbeddings;
    private splitter: RecursiveCharacterTextSplitter;

    private constructor() {
        this.embeddings = new OllamaEmbeddings({
            model: EMBEDDING_MODEL,
            baseUrl: `http://127.0.0.1:${ollamaPort}`,
        });

        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 600, // Smaller chunks for more precise medical context
            chunkOverlap: 100,
            separators: ["\n\n", "\n", ". ", " ", ""], // Prioritize paragraphs and sentences
        });
    }

    public static getInstance(): KnowledgeBase {
        if (!KnowledgeBase.instance) {
            KnowledgeBase.instance = new KnowledgeBase();
        }
        return KnowledgeBase.instance;
    }

    /**
     * Initializes (or re-ingests) the knowledge base.
     * Populates both structured Rules (relational) and unstructured Chunks (vector).
     */
    public async initializeKnowledgeBase(sourcePath: string): Promise<void> {
        try {
            logger.info('--- Initializing Hybrid Knowledge Base ---');
            
            // 1. Clear existing data
            await prisma.knowledgeRule.deleteMany({});
            // LangChain's PGVectorStore doesn't have an easy "deleteAll", so we use raw SQL via Prisma
            await prisma.$executeRawUnsafe('TRUNCATE TABLE knowledge_embeddings CASCADE;');

            const files = await fs.promises.readdir(sourcePath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            let allKnowledge: any[] = [];
            for (const file of jsonFiles) {
                const filePath = path.join(sourcePath, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const data = JSON.parse(content);
                allKnowledge = allKnowledge.concat(data.map((k: any) => ({ ...k, source: file })));
            }

            // 2. Populate Relational Rules (for visibility and strict workflows)
            for (const k of allKnowledge) {
                await prisma.knowledgeRule.create({
                    data: {
                        documentId: k.documentId,
                        title: k.title,
                        domain: k.domain,
                        content: k.content,
                        metadata: k.metadata || {},
                        isActive: true
                    }
                });
            }

            // 3. Populate Vector Embeddings (with recursive chunking)
            const langchainDocs: Document[] = [];
            for (const k of allKnowledge) {
                const chunks = await this.splitter.createDocuments(
                    [k.content],
                    [{ 
                        documentId: k.documentId,
                        title: k.title, 
                        domain: k.domain, 
                        source: k.source,
                        ...k.metadata 
                    }]
                );
                langchainDocs.push(...chunks);
            }

            this.vectorStore = await PGVectorStore.fromDocuments(
                langchainDocs,
                this.embeddings,
                pgVectorConfig
            );

            logger.info(`Knowledge base initialized: ${allKnowledge.length} rules, ${langchainDocs.length} vector chunks.`);
        } catch (error) {
            logger.error('Failed to initialize the knowledge base:', error);
            throw error;
        }
    }

    public async connectToExistingStore(): Promise<void> {
        try {
            this.vectorStore = await PGVectorStore.initialize(
                this.embeddings,
                pgVectorConfig
            );
            logger.info('Connected to existing Hybrid knowledge base');
        } catch (error) {
            logger.warn('PGVector store not yet initialized.');
        }
    }

    /**
     * Priority retrieval:
     * 1. Search KnowledgeRule table for keyword/topic triggers.
     * 2. Fallback to Vector Store for semantic similarity.
     */
    public async searchRelevant(text: string, domains?: string[]): Promise<SearchResult[] | null> {
        try {
            // Filter by domains if provided
            const domainFilter = domains && domains.length > 0 ? { in: domains } : undefined;

            // Path 1: Strict Rule Lookup (Deterministic)
            // We search for rules where the title or ANY word in the text matches the rule content/title
            const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
            logger.info(`Analyzing words for strict match: [${words.join(', ')}]`);
            
            const strictRules = await prisma.knowledgeRule.findMany({
                where: {
                    isActive: true,
                    domain: domainFilter,
                    OR: [
                        { title: { in: words, mode: 'insensitive' } },
                        { title: { contains: text, mode: 'insensitive' } },
                        // Check if any of our trigger words are in the content
                        ...words.map(word => ({
                            content: { contains: word, mode: 'insensitive' as Prisma.QueryMode }
                        }))
                    ]
                },
                take: 3
            });

            if (strictRules.length > 0) {
                logger.info(`Matched ${strictRules.length} strict rules via priority lookup`);
                strictRules.forEach(r => {
                    const matchSource = words.find(w => r.content.toLowerCase().includes(w)) || 'title/text match';
                    logger.info(`  [MATCH] Rule ID ${r.id} (${r.title}) triggered by: "${matchSource}"`);
                });
                return strictRules.map((r: KnowledgeRule) => ({
                    documentId: r.documentId,
                    title: r.title,
                    domain: r.domain,
                    content: r.content,
                    similarity: 1.0, // Strict matches are high priority
                    metadata: {
                        ...(r.metadata as any),
                        ruleId: r.id
                    }
                }));
            }

            // Path 2: Semantic Vector Fallback
            if (!this.vectorStore) return null;
            
            // Build filter for metadata if domains are provided
            const vectorFilter = domains && domains.length > 0 
                ? { domain: { in: domains } } 
                : undefined;

            const results = await this.vectorStore.similaritySearchWithScore(
                text, 
                5,
                vectorFilter as any
            );
            
            // Apply threshold (standard practice: 0.4)
            const filteredResults = results.filter(([_, score]) => score >= 0.4);

            return filteredResults.map(([doc, score]) => ({
                documentId: doc.metadata.documentId as string,
                title: doc.metadata.title as string,
                domain: doc.metadata.domain as string,
                content: doc.pageContent,
                similarity: score,
                metadata: doc.metadata
            }));
        } catch (error) {
            logger.error('Error during hybrid search:', error);
            return null;
        }
    }

    public async searchKnowledgeByTopic(topic: string): Promise<SearchResult[] | null> {
        // Topic search is now naturally handled by searchRelevant or can be specialized
        return this.searchRelevant(topic);
    }
}