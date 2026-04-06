import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { KnowledgeBase } from "../RAGservice/knowledgeBase";
import { SearchResult } from "../../types";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { logger } from "../../utils/logger";

/**
 * Define the state for the LangGraph agent.
 * This state is passed between nodes and updated along the way.
 */
export const AgentState = Annotation.Root({
  /** The user's input question */
  question: Annotation<string>,
  /** History of the conversation */
  history: Annotation<BaseMessage[]>,
  /** Retrieved documents from the knowledge base */
  documents: Annotation<SearchResult[]>,
  /** The generated response from the LLM */
  generation: Annotation<string>,
  /** Metadata for automated evaluation and tracking */
  evalMetadata: Annotation<Record<string, any>>,
  /** The username of the user */
  username: Annotation<string>,
  /** The type of message (general, submit, etc.) */
  messageType: Annotation<string>,
});

/**
 * Node: Retrieval
 * Searches the knowledge base for relevant documents based on the question.
 */
const retrieveNode = async (state: typeof AgentState.State) => {
  logger.info(`--- RETRIEVING for: ${state.question} ---`);
  const knowledgeBase = KnowledgeBase.getInstance();
  const results = await knowledgeBase.searchRelevant(state.question);

  return {
    documents: results || [],
    evalMetadata: {
      retrievalCount: results?.length || 0,
      topScore: results?.[0]?.similarity || 0,
    }
  };
};

/**
 * Node: Generation
 * Calls the LLM to generate a response based on the retrieved documents.
 */
const generateNode = async (state: typeof AgentState.State, config?: any) => {
  logger.info(`--- GENERATING response ---`);
  const { question, documents, username, messageType } = state;
  const llm = config.configurable.llm as ChatOllama;

  // We use the OllamaService indirectly or just call the LLM here directly for cleaner graph logic
  // For now, let's assume the prompt generation logic from promptFactory is used
  // Or we can implement a more "LangChain-native" prompt here
  
  // Integrating the existing promptGenerator logic
  const { ollamaService } = await import("../../server");
  const result = await ollamaService.generate(username, question, documents);

  return {
    generation: result.response,
    evalMetadata: {
      ...state.evalMetadata,
      llmResponseLength: result.response.length,
    }
  };
};

/**
 * Node: Submission
 * Handles ticket submission logic specifically.
 */
const submitNode = async (state: typeof AgentState.State, config?: any) => {
  logger.info(`--- SUBMITTING TICKET ---`);
  const { question, username } = state;
  const { ollamaService } = await import("../../server");
  
  const result = await ollamaService.submitTicket(username, question);
  
  return {
    generation: result.response,
    evalMetadata: {
      ...state.evalMetadata,
      isSubmission: true,
    }
  };
};

/**
 * Node: Analysis / Audit
 * Analyzes the response for auditing and sets "Human Intervention" if needed.
 */
const analyzeNode = async (state: typeof AgentState.State) => {
  logger.info(`--- ANALYZING response ---`);
  const isManIntervention = state.documents.some(d => d.metadata?.isManIntervention);

  return {
    evalMetadata: {
      ...state.evalMetadata,
      requiresHumanIntervention: isManIntervention,
      finalResponsePreview: state.generation.substring(0, 50) + "...",
      timestamp: new Date().toISOString(),
    }
  };
};

/**
 * Conditional logic: Route based on message type.
 */
const routeByMessageType = (state: typeof AgentState.State) => {
  if (state.messageType === "submit") {
    return "submit";
  }
  return "generate";
};

// Build the Graph with Conditional Routing
const workflow = new StateGraph(AgentState)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addNode("submit", submitNode)
  .addNode("analyze", analyzeNode)
  .addEdge(START, "retrieve")
  .addConditionalEdges("retrieve", routeByMessageType, {
    submit: "submit",
    generate: "generate",
  })
  .addEdge("generate", "analyze")
  .addEdge("submit", "analyze")
  .addEdge("analyze", END);

/**
 * Compiled LangGraph agent.
 */
export const agentGraph = workflow.compile();
