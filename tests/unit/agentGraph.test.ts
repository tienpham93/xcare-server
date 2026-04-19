import { describe, test, expect, mock, beforeEach } from "bun:test";
import { agentGraph } from "../../src/services/graph/agentGraph";
import { KnowledgeBase } from "../../src/services/RAGservice/knowledgeBase";

// 1. Mock the services that nodes depend on
// These are "Spies" that allow us to control and verify LLM/Service behavior
const mockClassifyIntent = mock();
const mockSearchRelevant = mock();
const mockGenerate = mock();
const mockSubmitTicket = mock();
const mockAssessContext = mock();

// 2. Mock the server module
// WHY: Nodes in agentGraph.ts use dynamic `await import("../../server.js")` to get the ollamaService instance.
// HOW: By mocking this module, we prevent the real server from starting (no DB/Express bootstrap)
// and instead inject our mock functions into the nodes when they run.
mock.module("../../src/server.js", () => ({
    ollamaService: {
        classifyIntent: mockClassifyIntent,
        generate: mockGenerate,
        submitTicket: mockSubmitTicket,
        assessContext: mockAssessContext,
        modelConfig: { name: "llama3" }
    }
}));

describe("AgentGraph Unit Tests", () => {
    
    beforeEach(() => {
        mockClassifyIntent.mockClear();
        mockSearchRelevant.mockClear();
        mockGenerate.mockClear();
        mockSubmitTicket.mockClear();
        mockAssessContext.mockClear();

        // Spy on and mock the KnowledgeBase instance
        const kb = KnowledgeBase.getInstance();
        kb.searchRelevant = mockSearchRelevant;
    });

    const createInitialState = (question: string, messageType: string = "general") => ({
        question,
        username: "testuser",
        messageType,
        sessionId: "test-session",
        history: [],
        documents: [],
        domains: [] as string[],
        intent: "CHAT",
        contextStatus: "SUFFICIENT" as const,
        generation: "",
        evalMetadata: {}
    });

    test("Should route GREETINGS directly through the generate node (Fast-path)", async () => {
        mockGenerate.mockResolvedValue({ response: "Hello there!" });

        const result = await agentGraph.invoke(createInitialState("hi"));

        expect(result.intent).toBe("CHAT");
        expect(result.generation).toBe("Hello there!");
        // Ensure retrieval was skipped
        expect(mockSearchRelevant).not.toHaveBeenCalled();
    });

    test("Should route TICKET intent to the submit node", async () => {
        // Mock router routing to TICKET
        mockClassifyIntent.mockResolvedValue({ intent: "TICKET", domains: ["symptoms"], reasoning: "test" });
        // Mock retrieval finding something (optional for ticket path depending on graph logic)
        mockSearchRelevant.mockResolvedValue([{ title: "Doc", content: "...", domain: "symptoms", documentId: "1", similarity: 0.9 }]);
        // Mock ranker agreeing it's a ticket
        mockAssessContext.mockResolvedValue({ context_sufficiency: "SUFFICIENT", relevance_score: 1.0 });
        // Mock submission
        mockSubmitTicket.mockResolvedValue({ response: "Ticket Created ID: 1" });

        const result = await agentGraph.invoke(createInitialState("I want to open a ticket"));

        expect(result.intent).toBe("TICKET");
        expect(result.generation).toBe("Ticket Created ID: 1");
        expect(mockSubmitTicket).toHaveBeenCalled();
    });

    test("Should route MEDICAL_QUERY to retrieve and then generate", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: "MEDICAL_QUERY", domains: ["symptoms"] });
        mockSearchRelevant.mockResolvedValue([{ title: "Fever Doc", content: "Take rest", domain: "symptoms", documentId: "1", similarity: 0.95 }]);
        mockAssessContext.mockResolvedValue({ context_sufficiency: "SUFFICIENT", relevance_score: 0.9 });
        mockGenerate.mockResolvedValue({ response: "Drink water and rest." });

        const result = await agentGraph.invoke(createInitialState("I have a fever"));

        expect(result.intent).toBe("MEDICAL_QUERY");
        expect(result.contextStatus).toBe("SUFFICIENT");
        expect(result.generation).toBe("Drink water and rest.");
        expect(mockSearchRelevant).toHaveBeenCalled();
        expect(mockGenerate).toHaveBeenCalled();
    });

    test("Should handle INSUFFICIENT context by escalating to Service Desk deterministically", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: "MEDICAL_QUERY", domains: ["symptoms"] });
        mockSearchRelevant.mockResolvedValue([]); // No results found
        // Ranker node returns INSUFFICIENT if no documents

        const result = await agentGraph.invoke(createInitialState("What is the meaning of life?"));

        expect(result.contextStatus).toBe("INSUFFICIENT");
        expect(result.generation).toContain("connecting to service desk");
    });
});
