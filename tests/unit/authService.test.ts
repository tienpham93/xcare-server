import { describe, test, expect, mock, beforeEach } from "bun:test";
import { AuthService } from "../../src/services/authService";


// 1. Setup global mocks BEFORE importing AuthService
// WHY: AuthService initializes a connection to Prisma for user lookup at the top level or during construction.
// HOW: We mock the prismaClient module to return an object that mimics our DB schema.
const mockFindUnique = mock();

mock.module("../../src/services/prismaClient", () => ({
    default: {
        user: {
            findUnique: mockFindUnique,
        },
    },
}));

describe("AuthService Unit Tests", () => {
    
    beforeEach(() => {
        mockFindUnique.mockClear();
    });

    test("Should create a JWT token for valid credentials", async () => {
        const username = "testuser";
        const password = "password123";
        
        // Mock DB response
        mockFindUnique.mockResolvedValue({
            username,
            password,
            fullname: "Test User",
            email: "test@example.com"
        });

        const auth = new AuthService(username, password);
        const token = await auth.createJwtToken();

        expect(token).not.toBeNull();
        expect(typeof token).toBe("string");
        expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    test("Should return null for non-existent user", async () => {
        mockFindUnique.mockResolvedValue(null);

        const auth = new AuthService("ghost", "boo");
        const token = await auth.createJwtToken();

        expect(token).toBeNull();
    });

    test("Should return null for incorrect password", async () => {
        mockFindUnique.mockResolvedValue({
            username: "testuser",
            password: "correct_password"
        });

        const auth = new AuthService("testuser", "wrong_password");
        const token = await auth.createJwtToken();

        expect(token).toBeNull();
    });

    test("Should verify a valid token", async () => {
        // We need a real token first
        mockFindUnique.mockResolvedValue({ username: "user", password: "p" });
        const auth = new AuthService("user", "p");
        const token = await auth.createJwtToken();

        const isValid = auth.verifyJwtToken(token!);
        expect(isValid).toBe(true);
    });

    test("Should reject an invalid token", () => {
        const auth = new AuthService();
        const isValid = auth.verifyJwtToken("not.a.token.at.all");
        expect(isValid).toBe(false);
    });

    test("Should extract and verify token from Bearer header", async () => {
        mockFindUnique.mockResolvedValue({ username: "user", password: "p" });
        const auth = new AuthService("user", "p");
        const token = await auth.createJwtToken();

        const isValid = auth.verifyTokenFromHeader(`Bearer ${token}`);
        expect(isValid).toBe(true);
    });

    test("Should return user metadata and token accurately", async () => {
        const dbUser = {
            id: 123,
            username: "realuser",
            password: "p",
            fullname: "Real User",
            gender: "M",
            age: "30",
            email: "real@user.com",
            user_type: "patient"
        };
        mockFindUnique.mockResolvedValue(dbUser);

        const auth = new AuthService("realuser", "p");
        const result = await auth.getUserDataAndToken();

        expect(result.token).not.toBeNull();
        expect(result.userMetadata.fullname).toBe("Real User");
        expect(result.userMetadata.id).toBe("123");
        // Ensure credentials are NOT leaked in metadata
        expect((result.userMetadata as any).password).toBeUndefined();
    });
});
