import axios from "axios";

const BASE_URL = "http://localhost:5002";

// Set a longer timeout for LLM generation
jest.setTimeout(60000);

describe("xcare-bot-agent API Tests", () => {
    let token: string;

    beforeAll(async () => {
        // Log in to get a valid token for subsequent tests
        try {
            const response = await axios.post(`${BASE_URL}/agent/login`, {
                username: "tienpham",
                password: "tienpham"
            });
            token = response.data.token;
        } catch (error) {
            console.error("Failed to log in during test setup:", error);
        }
    });

    test("POST /agent/login - Success", async () => {
        const response = await axios.post(`${BASE_URL}/agent/login`, {
            username: "tienpham",
            password: "tienpham"
        });
        expect(response.status).toBe(200);
        expect(response.data.token).toBeDefined();
    });

    test("POST /agent/generate - General Query", async () => {
        const response = await axios.post(`${BASE_URL}/agent/generate`, 
            {
                prompt: "I have a headache, what should I do?",
                username: "tienpham",
                messageType: "general"
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        expect(response.status).toBe(200);
        expect(response.data.conversation.message[1].content).toBeDefined();
        // Check for the new debug metadata added for the Professional Evaluator
        expect(response.data.debug).toBeDefined();
        expect(response.data.debug.retrievalCount).toBeGreaterThanOrEqual(0);
    });

    test("POST /agent/generate - Unauthorized Request", async () => {
        try {
            await axios.post(`${BASE_URL}/agent/generate`, {
                prompt: "test",
            }, {
                headers: { Authorization: "Bearer InvalidToken" }
            });
        } catch (error: any) {
            expect(error.response.status).toBe(401);
            expect(error.response.data.error).toBe("Unauthorized request");
        }
    });

    test("GET /agent/tickets - Protected Route", async () => {
        // This route requires Bearer token and createdBy query param
        const response = await axios.get(`${BASE_URL}/agent/tickets`, {
            params: { createdBy: "tienpham" },
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
    });
});
