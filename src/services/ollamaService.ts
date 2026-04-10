import { ModelConfig, SearchResult, User } from "../types";
import { defautModelConfig, isValidModel } from "../config/modelConfig";
import { logger } from "../utils/logger";
import { ChatOllama } from "@langchain/ollama";
import { promptGenerator } from "../prompt/promptFactory";
import { parseAnswer } from "../utils/stringFormat";
import { serverHost } from "../server";
import { HumanMessage } from "@langchain/core/messages";

export class OllamaService {
    public baseUrl: string;
    public modelConfig: ModelConfig;
    public llm: ChatOllama;

    constructor(host: string) {
        this.baseUrl = host;
        this.modelConfig = defautModelConfig;
        this.llm = new ChatOllama({
            baseUrl: this.baseUrl,
            model: this.modelConfig.name,
            temperature: this.modelConfig.parameters.temperature,
            topP: this.modelConfig.parameters.top_p,
            numPredict: this.modelConfig.parameters.num_predict,
        });
    }

    async initialize(modelName?: string) {
        try {
            const model = modelName && isValidModel(modelName) ? modelName : this.modelConfig.name;
            this.modelConfig.name = model;
            
            // Re-initialize LLM with the correct model
            this.llm = new ChatOllama({
                baseUrl: this.baseUrl,
                model: this.modelConfig.name,
                temperature: this.modelConfig.parameters.temperature,
                topP: this.modelConfig.parameters.top_p,
                numPredict: this.modelConfig.parameters.num_predict,
            });

            logger.info({ message: `Initialized ChatOllama with model: ${model}` });
        } catch (error) {
            logger.error("Failed to initialize OllamaService", error);
        }
    }

    async classifyIntent(prompt: string): Promise<any> {
        try {
            const completePrompt = await promptGenerator("router", prompt, []);
            const response = await this.llm.invoke([new HumanMessage(completePrompt)]);
            const parsed = parseAnswer(response.content as string);
            return parsed.intent ? parsed : { intent: "MEDICAL_QUERY", domains: ["general"], reasoning: "fallback" };
        } catch (error) {
            logger.error("Error in classifyIntent", error);
            return { intent: "MEDICAL_QUERY", domains: ["general"], reasoning: "error fallback" };
        }
    }

    async assessContext(prompt: string, context: SearchResult): Promise<any> {
        try {
            const completePrompt = await promptGenerator("ranker", prompt, [context]);
            const response = await this.llm.invoke([new HumanMessage(completePrompt)]);
            const parsed = parseAnswer(response.content as string);
            return parsed.context_sufficiency ? parsed : { relevance_score: 0.5, is_relevant: true, context_sufficiency: "SUFFICIENT" };
        } catch (error) {
            logger.error("Error in assessContext", error);
            return { relevance_score: 0.5, is_relevant: true, context_sufficiency: "SUFFICIENT" };
        }
    }

    async generate(username: string, prompt: string, relevantResult?: SearchResult[] | null, intent: string = "UNKNOWN"): Promise<any> {
        try {
            const completePrompt = await promptGenerator(
                "general",
                prompt, 
                relevantResult || [], 
                username,
                intent
            );

            const response = await this.llm.invoke([
                new HumanMessage(completePrompt)
            ]);

            return {
                response: response.content,
                completePrompt: completePrompt
            }
        } catch (error) {
            logger.error("Error when processing the response with ChatOllama", error);
            throw error;
        }
    }

    async submitTicket(username: string, prompt: string, relevantResult?: SearchResult[] | null): Promise<any> {
        try {
            const completePrompt = await promptGenerator(
                "submit",
                prompt, 
                [],       // No RAG context needed — just user profile + message
                username
            );

            const response = await this.llm.invoke([
                new HumanMessage(completePrompt)
            ]);

            const responseContent = response.content as string;
            const rawAnswer = parseAnswer(responseContent);
            let responseAnswer = `***{ "answer": "You missed ${rawAnswer.data} please submit again follow this format title: <title> and content: <content>" }***`;
            
            if (rawAnswer.isValid) {
                const ticketData = rawAnswer.data;
                const resSubmit = await fetch(`${serverHost}/agent/submit`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(ticketData)
                });
                const resData = await resSubmit.json();
                responseAnswer = `***{ "answer": "Your ticket has been created successfully with ticket ID is ${resData.id}" }***`;
            }

            return {
                response: responseAnswer,
                completePrompt: completePrompt
            }
        } catch (error) {
            logger.error("Error in submitTicket with ChatOllama", error);
            throw error;
        }
    }

    setModel(modelName: string) {
        if (!isValidModel(modelName)) {
            throw new Error(`Invalid model name: ${modelName}`);
        }
        this.modelConfig.name = modelName;
        // Update LLM instance
        this.llm = new ChatOllama({
            baseUrl: this.baseUrl,
            model: this.modelConfig.name,
            temperature: this.modelConfig.parameters.temperature,
            topP: this.modelConfig.parameters.top_p,
            numPredict: this.modelConfig.parameters.num_predict,
        });
    }

    setParameters(parameters: ModelConfig["parameters"]) {
        this.modelConfig.parameters = parameters;
        // Update LLM instance
        this.llm = new ChatOllama({
            baseUrl: this.baseUrl,
            model: this.modelConfig.name,
            temperature: this.modelConfig.parameters.temperature,
            topP: this.modelConfig.parameters.top_p,
            numPredict: this.modelConfig.parameters.num_predict,
        });
    }
}
