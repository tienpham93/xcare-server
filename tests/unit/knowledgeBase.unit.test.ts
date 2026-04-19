import { describe, test, expect, mock, beforeEach } from "bun:test";

// 1. Mock Prisma FIRST
// WHY: KnowledgeBase relies on Prisma to fetch deterministic "Strict Rules."
// HOW: We mock the findMany operation to simulate both hits and misses in the rule database.
const mockFindMany = mock();
mock.module("../../src/services/prismaClient", () => ({
    default: {
        knowledgeRule: {
            findMany: mockFindMany,
        },
    },
}));

// 2. Mock PGVectorStore
// WHY: Avoid initializing a real PostgreSQL connection during unit tests.
// HOW: We mock the entire PGVectorStore module.
const mockSimilaritySearchWithScore = mock();
mock.module("@langchain/community/vectorstores/pgvector", () => ({
    PGVectorStore: {
        initialize: mock(),
        fromDocuments: mock(),
    }
}));

// 3. Mock OllamaEmbeddings
mock.module("@langchain/ollama", () => ({
    OllamaEmbeddings: class { constructor() {} }
}));

import { KnowledgeBase } from "../../src/services/RAGservice/knowledgeBase";

describe("KnowledgeBase Unit Tests (Logic & Priority)", () => {
    let kb: KnowledgeBase;

    beforeEach(async () => {
        // Reset Singleton Instance to ensure fresh state with current mocks
        (KnowledgeBase as any).instance = undefined;
        kb = KnowledgeBase.getInstance();
        
        mockFindMany.mockClear();
        mockSimilaritySearchWithScore.mockClear();
        
        // Inject a mocked vector store
        (kb as any).vectorStore = {
            similaritySearchWithScore: mockSimilaritySearchWithScore
        };
    });

    test("searchRelevant should prioritize strict matches and bypass vector search", async () => {
        // Mock a strict rule match (Title or Content must match 'headache')
        mockFindMany.mockResolvedValue([{
            id: "rule-1",
            documentId: "doc-1",
            title: "headache", // Matches the query 'headache'
            content: "Treatment for headache",
            domain: "symptoms",
            metadata: {}
        }]);

        const results = await kb.searchRelevant("headache", ["symptoms"]);

        expect(results).toHaveLength(1);
        expect(results![0].documentId).toBe("doc-1");
        expect(results![0].similarity).toBe(1.0);
        
        // Ensure vector search was NOT called (Priority Rule)
        expect(mockSimilaritySearchWithScore).not.toHaveBeenCalled();
    });

    test("searchRelevant should fallback to vector search if no strict rules found", async () => {
        // No strict rules
        mockFindMany.mockResolvedValue([]);
        
        // Mock vector store response
        mockSimilaritySearchWithScore.mockResolvedValue([[
            { 
                pageContent: "Semantic match", 
                metadata: { documentId: "vec-1", title: "Vec Doc", domain: "symptoms" } 
            }, 
            0.85 
        ]]);

        const results = await kb.searchRelevant("something obscure", ["symptoms"]);

        expect(results).toHaveLength(1);
        expect(results![0].documentId).toBe("vec-1");
        expect(results![0].similarity).toBe(0.85);
        expect(mockSimilaritySearchWithScore).toHaveBeenCalled();
    });

    test("searchRelevant should filter results by similarity threshold", async () => {
        mockFindMany.mockResolvedValue([]);
        
        // Mock a very low similarity result (below 0.4)
        mockSimilaritySearchWithScore.mockResolvedValue([[
            { pageContent: "Garbage", metadata: { documentId: "bad", domain: "symptoms" } }, 
            0.2 
        ]]);

        const results = await kb.searchRelevant("unrelated stuff", ["symptoms"]);

        expect(results).toHaveLength(0);
    });
});
