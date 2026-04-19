import { describe, test, expect } from "bun:test";
import { parseAnswer } from "../../src/utils/stringFormat";

describe("JSON Parsing Unit Tests", () => {
    
    test("Should parse standard triple-asterisk wrapped JSON", () => {
        const input = 'Here is your answer: ***{"answer": "Hello world", "isManIntervention": false}*** Hope this helps!';
        const result = parseAnswer(input);
        expect(result.answer).toBe("Hello world");
        expect(result.isManIntervention).toBe(false);
    });

    test("Should parse multiline triple-asterisk wrapped JSON", () => {
        const input = `
            Some text before.
            ***
            {
                "answer": "This is a multiline\\nanswer",
                "isManIntervention": true
            }
            ***
            Some text after.
        `;
        const result = parseAnswer(input);
        expect(result.answer).toBe("This is a multiline\nanswer");
        expect(result.isManIntervention).toBe(true);
    });

    test("Should fallback to raw JSON extraction if asterisks are missing", () => {
        const input = 'The user wants to know about fever. {"intent": "MEDICAL_QUERY", "domains": ["symptoms"]}';
        const result = parseAnswer(input);
        expect(result.intent).toBe("MEDICAL_QUERY");
        expect(result.domains).toContain("symptoms");
    });

    test("Should handle JSON with escaped characters", () => {
        const input = '***{"answer": "I don\'t know \\"exactly\\"", "isManIntervention": false}***';
        const result = parseAnswer(input);
        expect(result.answer).toBe("I don't know \"exactly\"");
    });

    test("Should return empty object for invalid JSON", () => {
        const input = '***{invalid json here}***';
        const result = parseAnswer(input);
        expect(result).toEqual({});
    });

    test("Should return empty object for no JSON found", () => {
        const input = 'There is no JSON in this string at all.';
        const result = parseAnswer(input);
        expect(result).toEqual({});
    });
});
