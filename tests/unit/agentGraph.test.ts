import { describe, test, expect, mock, beforeEach } from "bun:test";
import { agentGraph } from "../../src/services/graph/agentGraph";
import { KnowledgeBase } from "../../src/services/RAGservice/knowledgeBase";
import { Intent, ContextStatus } from "../../src/types";

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

// 3. Mock global fetch for ticket operations
const mockFetch = mock();
global.fetch = mockFetch as any;

describe("AgentGraph Unit Tests", () => {
    
    beforeEach(() => {
        mockClassifyIntent.mockClear();
        mockSearchRelevant.mockClear();
        mockGenerate.mockClear();
        mockSubmitTicket.mockClear();
        mockAssessContext.mockClear();
        mockFetch.mockClear();

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
        intent: Intent.CHAT,
        contextStatus: ContextStatus.SUFFICIENT,
        generation: "",
        evalMetadata: {},
        usedWebSearch: false,
    });

    test("Should route CHAT intent through generate-without-kb (LLM classified, no fast-path)", async () => {
        // classifyIntent is always called — no fast-path greeting bypass
        mockClassifyIntent.mockResolvedValue({ intent: Intent.CHAT, domains: [], reasoning: "Greeting" });
        mockGenerate.mockResolvedValue({ response: "Hello there!" });

        const result = await agentGraph.invoke(createInitialState("hi"));

        expect(result.intent).toBe(Intent.CHAT);
        expect(result.generation).toBe("Hello there!");
        // Ensure classifyIntent WAS called (no fast-path)
        expect(mockClassifyIntent).toHaveBeenCalledTimes(1);
        // Ensure retrieval was skipped (CHAT goes to generate-without-kb)
        expect(mockSearchRelevant).not.toHaveBeenCalled();
    });

    test("Should route TICKET_SUBMIT intent to the submit node", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.TICKET_SUBMIT, domains: [], reasoning: "Ticket submission" });
        mockSubmitTicket.mockResolvedValue({ response: "Ticket Created ID: 1" });

        const result = await agentGraph.invoke(createInitialState("I want to open a ticket"));

        expect(result.intent).toBe(Intent.TICKET_SUBMIT);
        expect(result.generation).toBe("Ticket Created ID: 1");
        expect(mockSubmitTicket).toHaveBeenCalled();
        // Retrieval should NOT be called for ticket submissions
        expect(mockSearchRelevant).not.toHaveBeenCalled();
    });

    test("Should route TICKET_GET intent to fetch tickets via internal API", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.TICKET_GET, domains: [], reasoning: "View tickets" });
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve([
                { id: "TK-1", title: "Fever issue", status: "Open" },
                { id: "TK-2", title: "Billing question", status: "Closed" },
            ])
        });

        const result = await agentGraph.invoke(createInitialState("Show me my tickets"));

        expect(result.intent).toBe(Intent.TICKET_GET);
        expect(result.generation).toContain("TK-1");
        expect(result.generation).toContain("TK-2");
        // submitTicket should NOT be called — this is a GET, not a SUBMIT
        expect(mockSubmitTicket).not.toHaveBeenCalled();
    });

    test("Should route TICKET_PROCESS intent to service desk escalation", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.TICKET_PROCESS, domains: [], reasoning: "Update ticket" });

        const result = await agentGraph.invoke(createInitialState("Please close my ticket #123"));

        expect(result.intent).toBe(Intent.TICKET_PROCESS);
        expect(result.generation).toContain("service desk team");
        expect(result.evalMetadata.isTicketProcess).toBe(true);
    });

    test("Should route MEDICAL_QUERY to retrieve and then generate-with-kb", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.MEDICAL_QUERY, domains: ["symptoms"] });
        mockSearchRelevant.mockResolvedValue([{ title: "Fever Doc", content: "Take rest", domain: "symptoms", documentId: "1", similarity: 0.95 }]);
        mockAssessContext.mockResolvedValue({ context_sufficiency: ContextStatus.SUFFICIENT, relevance_score: 0.9 });
        mockGenerate.mockResolvedValue({ response: "Drink water and rest." });

        const result = await agentGraph.invoke(createInitialState("I have a fever"));

        expect(result.intent).toBe(Intent.MEDICAL_QUERY);
        expect(result.contextStatus).toBe(ContextStatus.SUFFICIENT);
        expect(result.generation).toBe("Drink water and rest.");
        expect(mockSearchRelevant).toHaveBeenCalled();
        expect(mockGenerate).toHaveBeenCalled();
    });

    test("Should handle INSUFFICIENT context by escalating to Service Desk deterministically", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.MEDICAL_QUERY, domains: ["symptoms"] });
        mockSearchRelevant.mockResolvedValue([]); // No results found
        // Ranker node returns INSUFFICIENT if no documents

        const result = await agentGraph.invoke(createInitialState("What is the meaning of life?"));

        expect(result.contextStatus).toBe(ContextStatus.INSUFFICIENT);
        expect(result.generation).toContain("connecting to service desk");
    });

    test("Should route OUT_OF_SCOPE through generate-without-kb with deterministic refusal", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.OUT_OF_SCOPE, domains: [], reasoning: "Non-medical" });

        const result = await agentGraph.invoke(createInitialState("What color is the sky?"));

        expect(result.intent).toBe(Intent.OUT_OF_SCOPE);
        expect(result.generation).toContain("unrelated to healthcare");
        // Retrieval should NOT be called for OUT_OF_SCOPE
        expect(mockSearchRelevant).not.toHaveBeenCalled();
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    test("Should route EMERGENCY through retrieve → ranker → generate-with-kb (strict answer path)", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.EMERGENCY, domains: ["service_desk", "symptoms"], reasoning: "Life-threatening" });
        mockSearchRelevant.mockResolvedValue([{
            title: "Emergency and Urgent Support",
            content: "If a user has an emergency...",
            domain: "service_desk",
            documentId: "sd-001",
            similarity: 0.98,
            metadata: {
                strictAnswer: "Please wait for awhile! A technician will assist you shortly",
                isManIntervention: true,
            }
        }]);
        mockAssessContext.mockResolvedValue({ context_sufficiency: ContextStatus.SUFFICIENT, relevance_score: 0.98 });

        const result = await agentGraph.invoke(createInitialState("Help! My friend is unconscious!"));

        expect(result.intent).toBe(Intent.EMERGENCY);
        expect(result.generation).toContain("technician will assist you");
        expect(result.evalMetadata.isDeterministic).toBe(true);
        // Retrieval MUST be called — EMERGENCY goes through KB path
        expect(mockSearchRelevant).toHaveBeenCalled();
    });

    test("Should route mixed greeting+medical as MEDICAL_QUERY (not CHAT)", async () => {
        mockClassifyIntent.mockResolvedValue({ intent: Intent.MEDICAL_QUERY, domains: ["symptoms"], reasoning: "Greeting + symptom" });
        mockSearchRelevant.mockResolvedValue([{ title: "Headache", content: "Rest and water", domain: "symptoms", documentId: "1", similarity: 0.9 }]);
        mockAssessContext.mockResolvedValue({ context_sufficiency: ContextStatus.SUFFICIENT, relevance_score: 0.9 });
        mockGenerate.mockResolvedValue({ response: "For a headache, rest and stay hydrated." });

        const result = await agentGraph.invoke(createInitialState("Hi, I have a terrible headache"));

        expect(result.intent).toBe(Intent.MEDICAL_QUERY);
        expect(mockSearchRelevant).toHaveBeenCalled();
        expect(mockGenerate).toHaveBeenCalled();
    });
});
