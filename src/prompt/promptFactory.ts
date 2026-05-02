import { serverHost } from "../env";
import { SearchResult, User, MessageType } from "../types";
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
 * Renders a template using Nunjucks (preserves whitespace)
 */
export const renderPrompt = (templateName: string, context: any = {}): string => {
    return nunjucks.render(templateName, context);
};

/**
 * Renders a template and collapses whitespace (useful for deterministic responses)
 */
export const renderResponse = (templateName: string, context: any = {}): string => {
    return renderPrompt(templateName, context).replace(/\s+/g, ' ').trim();
};

export const promptGenerator = async (
    messageType: string, 
    message: string, 
    knowledge: SearchResult[], 
    username?: string,
    intent: string = "UNKNOWN"
): Promise<string> => {
    switch (messageType) {
        case MessageType.GENERAL:
            return renderPrompt("tasks/general.njk", {
                knowledge_items: knowledge,
                user_query: message,
                intent: intent
            });

        case MessageType.ROUTER:
            return renderPrompt("tasks/router.njk", {
                user_query: message
            });

        case MessageType.RANKER:
            return renderPrompt("tasks/ranker.njk", {
                user_query: message,
                context_item: knowledge?.[0]?.content || ""
            });

        case MessageType.SUBMIT: {
            const userInfo = username ? await userInfos(username) : "No user information available.";
            return renderPrompt("tasks/ticket_extraction.njk", {
                user_infos: userInfo,
                user_query: message
            });
        }

        default:
            return renderPrompt("tasks/general.njk", {
                knowledge_items: knowledge,
                user_query: message
            });
    }
};