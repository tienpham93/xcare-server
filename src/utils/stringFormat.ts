


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
    // regex 's' flag allows matching across multiple lines
    const match = response.match(/\*\*\*\s*({.*})\s*\*\*\*/s);
    if (match && match[1]) {
        try {
            const jsonString = match[1]
                .replace(/True/g, 'true')
                .trim();
            return JSON.parse(jsonString);
        } catch (e) {
            logger.error("Failed to parse JSON in parseAnswer:", e);
            return {};
        }
    }
    return {};
};