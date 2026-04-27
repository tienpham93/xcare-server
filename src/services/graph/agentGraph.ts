import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { KnowledgeBase } from "../RAGservice/knowledgeBase";
import { SearchResult } from "../../types";
import { BaseMessage } from "@langchain/core/messages";
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
  intent: Annotation<string>,
  domains: Annotation<string[]>,
  contextStatus: Annotation<"SUFFICIENT" | "INSUFFICIENT">,
  // Whether the web search fallback was triggered
  usedWebSearch: Annotation<boolean>,
});

const routerNode = async (state: typeof AgentState.State) => {
  const query = state.question.toLowerCase().trim().replace(/[?!.]/g, '');
  const commonGreetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'hi there', 'hello there'];

  // Fast-path 1: Frontend explicitly signals ticket submission
  if (state.messageType === "submit") {
    logger.info(`--- FAST-PATH: Frontend declared messageType=submit ---`);
    return {
      intent: "TICKET",
      domains: [],
      evalMetadata: { intentReasoning: "Frontend declared ticket submission" }
    };
  }

  // Fast-path 2: Common greeting bypass
  if (commonGreetings.includes(query)) {
    logger.info(`--- FAST-PATH: Detected common greeting: ${query} ---`);
    return {
      intent: "CHAT",
      domains: [],
      evalMetadata: { intentReasoning: "Fast-path greeting detection" }
    };
  }

  logger.info(`--- CLASSIFYING intent for: ${state.question} ---`);
  const { ollamaService } = await import("../../server.js");
  
  const result = await ollamaService.classifyIntent(state.question);
  
  return {
    intent: result.intent,
    domains: result.domains,
    evalMetadata: {
        intentReasoning: result.reasoning
    }
  };
};

/**
 * Node: Retrieval
 * Searches the PGVector knowledge base for relevant documents.
 */
const retrieveNode = async (state: typeof AgentState.State) => {
  if (state.intent === "CHAT" || state.intent === "OUT_OF_SCOPE") {
    logger.info(`--- SKIPPING retrieval for ${state.intent} ---`);
    return { documents: [] };
  }

  logger.info(`--- RETRIEVING for: ${state.question} (Domains: ${state.domains.join(", ")}) ---`);
  const knowledgeBase = KnowledgeBase.getInstance();
  const results = await knowledgeBase.searchRelevant(state.question, state.domains);

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
 * Node: Ranker
 * Assesses the relevance and sufficiency of retrieved documents.
 */
const rankerNode = async (state: typeof AgentState.State) => {
  if (state.documents.length === 0) {
    return { contextStatus: "INSUFFICIENT" as const };
  }

  logger.info("--- RANKING retrieved documents ---");
  const { ollamaService } = await import("../../server.js");
  
  // For now, we assess the top document (can be expanded to batch)
  const topDoc = state.documents[0];
  const assessment = await ollamaService.assessContext(state.question, topDoc);
  
  logger.info(`Context Assessment: ${assessment.context_sufficiency} (Score: ${assessment.relevance_score})`);

  return {
    contextStatus: assessment.context_sufficiency,
    evalMetadata: {
        ...state.evalMetadata,
        relevanceScore: assessment.relevance_score,
        rankingReasoning: assessment.reasoning
    }
  };
};

const generateNode = async (state: typeof AgentState.State, config?: any) => {
  const { question, documents, username, contextStatus, intent } = state;
  const { ollamaService } = await import("../../server.js");

  // 1. Path A: Intent is OUT_OF_SCOPE -> Deterministic Refusal
  if (intent === "OUT_OF_SCOPE") {
    logger.info(`--- HANDLING OUT_OF_SCOPE directly ---`);
    const deterministicResponse = `***{
      "answer": "I am a medical assistant. I cannot answer queries unrelated to healthcare.",
      "isManIntervention": false,
      "suggested_actions": []
    }***`.replace(/\s+/g, ' ');

    return {
      generation: deterministicResponse,
      evalMetadata: { ...state.evalMetadata, isDeterministic: true, isOutOfScope: true }
    };
  }

  // 1. Path B: Intent is CHAT -> Skip RAG and Rules, just respond
  if (intent === "CHAT") {
    logger.info(`--- HANDLING simple chat/greeting ---`);
    const result = await ollamaService.generate(username, question, [], intent);
    return {
      generation: result.response,
      evalMetadata: { ...state.evalMetadata, isChat: true, isDeterministic: false }
    };
  }

  // 2. Path B: Sufficient Context -> RAG Generation
  if (contextStatus === "SUFFICIENT") {
    logger.info(`--- GENERATING RAG response ---`);
    
    // Check for Priority Strict Rule (Pre-generation bypass)
    const strictDoc = documents.find(d => d.metadata?.strictAnswer && (d.similarity || 0) >= 0.95);
    if (strictDoc && strictDoc.metadata) {
      logger.info(`--- DETERMINISTIC Answer triggered for: ${strictDoc.title} ---`);
      
      // Standardize the response format to match LLM output for consistency
      const deterministicResponse = `***{
        "answer": "${strictDoc.metadata.strictAnswer}",
        "isManIntervention": ${strictDoc.metadata.isManIntervention || false},
        "suggested_actions": ${JSON.stringify(strictDoc.metadata.suggested_actions || [])}
      }***`.replace(/\s+/g, ' ');

      return {
        generation: deterministicResponse,
        evalMetadata: { ...state.evalMetadata, isDeterministic: true, ruleId: strictDoc.metadata.ruleId }
      };
    }

    const result = await ollamaService.generate(username, question, documents, intent);
    return {
      generation: result.response,
      evalMetadata: { ...state.evalMetadata, llmResponseLength: result.response.length, isDeterministic: false }
    };
  }

  // 3. Path C: Insufficient Context -> Fallback to Rules (e.g. Technician Handover)
  logger.info(`--- CONTEXT INSUFFICIENT for medical query, checking for fallback rules ---`);
  const knowledgeBase = KnowledgeBase.getInstance();
  const fallbacks = await knowledgeBase.searchRelevant(question);
  const strictFallback = fallbacks?.find(d => d.metadata?.strictAnswer);

  if (strictFallback && strictFallback.metadata) {
    logger.info(`--- FALLBACK RULE triggered: ${strictFallback.title} ---`);
    
    // Standardize the response format
    const deterministicResponse = `***{
      "answer": "${strictFallback.metadata.strictAnswer}",
      "isManIntervention": ${strictFallback.metadata.isManIntervention || false},
      "suggested_actions": ${JSON.stringify(strictFallback.metadata.suggested_actions || [])}
    }***`.replace(/\s+/g, ' ');

    return {
      generation: deterministicResponse,
      evalMetadata: { ...state.evalMetadata, isDeterministic: true, isFallback: true }
    };
  }

  // 3. Path D: Complete Miss -> Hardcode Service Desk Handover
  logger.info(`--- NO RULES found, escalating to Service Desk ---`);
  const fallbackResponse = `***{
    "answer": "Your query is out of my knowledge, please wait for a minute! I am connecting to service desk team",
    "isManIntervention": true,
    "suggested_actions": [{"label": "Contact Service Desk", "targetDomain": "service_desk"}]
  }***`.replace(/\s+/g, ' ');

  return {
    generation: fallbackResponse,
    evalMetadata: { ...state.evalMetadata, isDeterministic: true, isFallback: true }
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
  const isManIntervention = state.documents.some(d => d.metadata?.isManIntervention) || state.contextStatus === "INSUFFICIENT";

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
 * Conditional logic: Route after router based on intent.
 */
const routeAfterRouter = (state: typeof AgentState.State): string => {
  if (state.intent === "CHAT") return "generate";
  return "retrieve";
};

/**
 * Conditional logic: Route after ranker based on intent.
 */
const routeByIntent = (state: typeof AgentState.State): string => {
  if (state.intent === "TICKET") return "submit";
  return "generate";
};

// Build the Graph with Multi-Stage Routing
const workflow = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("retrieve", retrieveNode)
  .addNode("ranker", rankerNode)
  .addNode("generate", generateNode)
  .addNode("submit", submitNode)
  .addNode("analyze", analyzeNode)

  // Edge Flow
  .addEdge(START, "router")
  .addConditionalEdges("router", routeAfterRouter, {
    generate: "generate",
    retrieve: "retrieve"
  })
  .addEdge("retrieve", "ranker")
  .addConditionalEdges("ranker", routeByIntent, {
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
