import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Intent } from "../../src/types";

// 1. Mock LangChain ChatOllama
// WHY: Prevent the service from making real HTTP calls to the local Ollama instance.
// HOW: We intercept the @langchain/ollama module and return a class with a mocked `invoke` method.
const mockInvoke = mock();
mock.module("@langchain/ollama", () => ({
    ChatOllama: class {
        invoke = mockInvoke;
        constructor() {}
    },
}));

import { OllamaService } from "../../src/services/ollamaService";

// 2. Mock global fetch
// WHY: OllamaService calls internal API endpoints (e.g., /agent/submit and /agent/user).
// HOW: We override the global `fetch` with a mock. The `as any` cast is required in TypeScript
// because the mock doesn't implement all static properties of the built-in fetch.
const mockFetch = mock();
global.fetch = mockFetch as any;

describe("OllamaService Unit Tests", () => {
    let service: OllamaService;

    beforeEach(() => {
        service = new OllamaService("http://127.0.0.1:11434");
        mockInvoke.mockClear();
        mockFetch.mockClear();
    });

    test("classifyIntent should return TICKET_SUBMIT for ticket creation requests", async () => {
        mockInvoke.mockResolvedValue({
            content: '***{"intent": "TICKET_SUBMIT", "domains": [], "reasoning": "User wants to open a ticket"}***'
        });

        const result = await service.classifyIntent("Submit a ticket about my fever");

        expect(result.intent).toBe(Intent.TICKET_SUBMIT);
        expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    test("classifyIntent should return TICKET_GET for ticket inquiry requests", async () => {
        mockInvoke.mockResolvedValue({
            content: '***{"intent": "TICKET_GET", "domains": [], "reasoning": "User wants to view tickets"}***'
        });

        const result = await service.classifyIntent("Show me my tickets");

        expect(result.intent).toBe(Intent.TICKET_GET);
    });

    test("classifyIntent should return TICKET_PROCESS for ticket update requests", async () => {
        mockInvoke.mockResolvedValue({
            content: '***{"intent": "TICKET_PROCESS", "domains": [], "reasoning": "User wants to close a ticket"}***'
        });

        const result = await service.classifyIntent("Please close my ticket #123");

        expect(result.intent).toBe(Intent.TICKET_PROCESS);
    });

    test("classifyIntent should fallback safely if LLM returns garbage", async () => {
        mockInvoke.mockResolvedValue({ content: "I am a crazy LLM and I won't give you JSON today!" });

        const result = await service.classifyIntent("Help me");

        // Should return the fallback defined in ollamaService.ts
        expect(result.intent).toBe(Intent.MEDICAL_QUERY);
        expect(result.reasoning).toBe("fallback");
    });

    test("assessContext should return SUFFICIENT when LLM agrees", async () => {
        mockInvoke.mockResolvedValue({
            content: '***{"relevance_score": 0.9, "is_relevant": true, "context_sufficiency": "SUFFICIENT"}***'
        });

        const result = await service.assessContext("headache", { title: "Doc", content: "Take paracetamol", domain: "symptoms", documentId: "1", similarity: 1 });

        expect(result.context_sufficiency).toBe("SUFFICIENT");
    });

    test("submitTicket should call the internal API and return success message", async () => {
        // LLM extracts ticket data
        mockInvoke.mockResolvedValue({
            content: '***{"isValid": true, "data": {"title": "Fever", "content": "I have a high fever"}}***'
        });

        // Mock the internal API calls (1. Get User, 2. Submit Ticket)
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ username: "tienpham", fullname: "Tien Pham" })
        });
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ id: "TK-123" })
        });

        const result = await service.submitTicket("tienpham", "I have a fever, open a ticket");

        expect(result.response).toContain("ticket ID is TK-123");
        // 1 call for user profile (inside promptGenerator), 1 for submission
        expect(mockFetch).toHaveBeenCalledTimes(2);
        
        // Final verification of URLs
        expect(mockFetch.mock.calls[0][0]).toContain("/agent/user?username=tienpham");
        expect(mockFetch.mock.calls[1][0]).toContain("/agent/submit");
    });

    test("generate should produce a prompt and result", async () => {
        mockInvoke.mockResolvedValue({ content: "This is a RAG answer" });

        const result = await service.generate("user", "my question", []);

        expect(result.response).toBe("This is a RAG answer");
        expect(result.completePrompt).toBeDefined();
    });
});
