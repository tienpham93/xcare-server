


import { logger } from "./logger";

export const extractSubString = (string: string, regex: RegExp): any => {
    const match = string.match(regex);
    if (match && match[1]) {
        const jsonString = match[1]
            .replace(/True/g, 'true')
            .replace(/'/g, '"');
        return JSON.parse(jsonString);
    }
    return null;
}

export const parseAnswer = (response: string): any => {
    // Attempt 1: standard ***{...}*** extraction (multiline safe, non-greedy)
    const match = response.match(/\*\*\*\s*({.*?})\s*\*\*\*/s);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1].replace(/True/g, 'true').trim());
        } catch (e) {
            logger.error("Failed to parse JSON in parseAnswer (*** match):", e);
        }
    }

    // Attempt 2: raw JSON block — handles LLMs that ignore the *** instruction
    const rawMatch = response.match(/({[\s\S]*?})/s);
    if (rawMatch && rawMatch[1]) {
        try {
            return JSON.parse(rawMatch[1].replace(/True/g, 'true').trim());
        } catch (e) {
            // not valid JSON — fall through
        }
    }

    return {};
};