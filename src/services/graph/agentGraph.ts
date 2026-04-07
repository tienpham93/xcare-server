import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { KnowledgeBase } from "../RAGservice/knowledgeBase";
import { SearchResult } from "../../types";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { logger } from "../../utils/logger";

/**
 * Define the state for the LangGraph agent.
 */
export const AgentState = Annotation.Root({
  question: Annotation<string>,
  history: Annotation<BaseMessage[]>,
  documents: Annotation<SearchResult[]>,
  generation: Annotation<string>,
  evalMetadata: Annotation<Record<string, any>>,
  username: Annotation<string>,
  messageType: Annotation<string>,
  // Whether the web search fallback was triggered
  usedWebSearch: Annotation<boolean>,
});

/**
 * Node: Retrieval
 * Searches the PGVector knowledge base for relevant documents.
 */
const retrieveNode = async (state: typeof AgentState.State) => {
  logger.info(`--- RETRIEVING for: ${state.question} ---`);
  const knowledgeBase = KnowledgeBase.getInstance();
  const results = await knowledgeBase.searchRelevant(state.question);

  const topScore = results?.[0]?.similarity || 0;

  return {
    documents: results || [],
    evalMetadata: {
      retrievalCount: results?.length || 0,
      topScore,
    }
  };
};

/**
 * Node: Generation
 * Calls the LLM to generate a response based on retrieved documents.
 * Integrates Hybrid logic: If a strictAnswer is found in the rules, bypass LLM.
 */
const generateNode = async (state: typeof AgentState.State, config?: any) => {
  logger.info(`--- GENERATING response ---`);
  const { question, documents, username } = state;

  // 1. Check for Strict Rule (Deterministic Path)
  const strictDoc = documents.find(d => d.metadata?.strictAnswer);
  if (strictDoc && strictDoc.metadata) {
    logger.info(`--- DETERMINISTIC Answer triggered for: ${strictDoc.topic} ---`);
    return {
      generation: strictDoc.metadata.strictAnswer!,
      evalMetadata: {
        ...state.evalMetadata,
        isDeterministic: true,
        ruleId: strictDoc.metadata.ruleId,
      }
    };
  }

  // 2. Dynamic LLM Generation (Semantic Path)
  const { ollamaService } = await import("../../server.js");
  const result = await ollamaService.generate(username, question, documents);

  return {
    generation: result.response,
    evalMetadata: {
      ...state.evalMetadata,
      llmResponseLength: result.response.length,
      usedWebSearch: state.usedWebSearch || false,
      isDeterministic: false,
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
  const { ollamaService } = await import("../../server.js");

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
 * Analyzes the response for auditing and flags for Human Intervention if needed.
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

// ─────────────────────────────────────────────────────────────────────────────
// [DRAFT] Web Search Node
// This node is scaffolded for future A/B testing integration.
// To enable: uncomment internals, install a web search library (e.g. Tavily),
// and wire the conditional edge below.
// ─────────────────────────────────────────────────────────────────────────────
const webSearchNode = async (state: typeof AgentState.State) => {
  logger.info(`--- [DRAFT] WEB SEARCH triggered for: ${state.question} ---`);

  // TODO: Enable this block when integrating web search for A/B testing
  // -----------------------------------------------------------------------
  // import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
  // const searchTool = new TavilySearchResults({ maxResults: 3 });
  // const webResults = await searchTool.invoke(state.question);
  // const webDocs: SearchResult[] = JSON.parse(webResults).map((r: any) => ({
  //   topic: 'web_search',
  //   category: 'external',
  //   content: r.content,
  //   similarity: 0.5,
  //   metadata: { source: r.url }
  // }));
  // return { documents: [...state.documents, ...webDocs], usedWebSearch: true };
  // -----------------------------------------------------------------------

  // Passthrough until enabled
  return { usedWebSearch: false };
};

/**
 * Conditional logic: Route based on message type.
 */
const routeByMessageType = (state: typeof AgentState.State): string => {
  if (state.messageType === "submit") return "submit";
  return "generate";
};

/**
 * Conditional logic: Optionally trigger web search if retrieval confidence is low.
 * Currently passes through directly to generate/submit. 
 * Flip the condition (e.g. topScore < 0.4) to activate web search fallback.
 */
const routeAfterRetrieval = (state: typeof AgentState.State): string => {
  // [DRAFT] Uncomment to activate web search fallback:
  // const topScore = state.evalMetadata?.topScore || 0;
  // if (topScore < 0.4 && state.messageType !== "submit") return "web_search";
  return routeByMessageType(state);
};

// Build the Graph with Conditional Routing
const workflow = new StateGraph(AgentState)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addNode("submit", submitNode)
  .addNode("analyze", analyzeNode)
  .addEdge(START, "retrieve")
  .addConditionalEdges("retrieve", routeAfterRetrieval, {
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
