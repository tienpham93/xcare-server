import { serverHost } from "../env";
import { SearchResult, User } from "../types";
import nunjucks from "nunjucks";
import path from "path";

// Configure Nunjucks to look in the templates directory
nunjucks.configure(path.join(__dirname, "templates"), { 
    autoescape: false // Important for LLM prompts to prevent HTML escaping
});

const userInfos = async (username: string): Promise<string> => {
    try {
        const response = await fetch(`${serverHost}/agent/user?username=${username}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });
        const data = await response.json() as unknown as User;
        return `username: ${data.username}, 
            gender: ${data.gender}, 
            age: ${data.age}, 
            email: ${data.email}`;
    } catch (error) {
        return "No user information available.";
    }
};

/**
 * Renders a prompt using Nunjucks
 */
const renderPrompt = (templateName: string, context: any): string => {
    return nunjucks.render(templateName, context);
};

export const promptGenerator = async (
    messageType: string, 
    message: string, 
    knowledge: SearchResult[], 
    username?: string,
    intent: string = "UNKNOWN"
): Promise<string> => {
    switch (messageType) {
        case "general":
            return renderPrompt("general.njk", {
                knowledge_items: knowledge,
                user_query: message,
                intent: intent
            });

        case "router":
            return renderPrompt("router.njk", {
                user_query: message
            });

        case "ranker":
            return renderPrompt("ranker.njk", {
                user_query: message,
                context_item: knowledge?.[0]?.content || ""
            });

        case "submit": {
            const userInfo = username ? await userInfos(username) : "No user information available.";
            return renderPrompt("ticket_extraction.njk", {
                user_infos: userInfo,
                user_query: message
            });
        }

        default:
            return renderPrompt("general.njk", {
                knowledge_items: knowledge,
                user_query: message
            });
    }
};