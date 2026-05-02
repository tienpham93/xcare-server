import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { KnowledgeBase } from "../RAGservice/knowledgeBase";
import { SearchResult, Intent, ContextStatus, ClassifyIntentResult, MessageType, Domain } from "../../types";
import { BaseMessage } from "@langchain/core/messages";
import { logger } from "../../utils/logger";
import { serverHost } from "../../env";
import { renderPrompt, renderResponse } from "../../prompt/promptFactory";

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
  messageType: Annotation<MessageType>,
  intent: Annotation<Intent>,
  domains: Annotation<Domain[]>,
  contextStatus: Annotation<ContextStatus>,
  // Whether the web search fallback was triggered
  usedWebSearch: Annotation<boolean>,
});

/**
 * Node: Router
 * Classifies every user message via the LLM — no fast-path keyword matching.
 */
const routerNode = async (state: typeof AgentState.State) => {
  logger.info(`--- CLASSIFYING intent for: ${state.question} ---`);
  const { ollamaService } = await import("../../server.js");

  const result: ClassifyIntentResult = await ollamaService.classifyIntent(state.question);

  return {
    intent: result.intent,
    domains: result.domains,
    evalMetadata: {
      intentReasoning: result.reasoning,
    },
  };
};

/**
 * Node: Retrieval
 * Searches the PGVector knowledge base for relevant documents.
 */
const retrieveNode = async (state: typeof AgentState.State) => {
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
    return { contextStatus: ContextStatus.INSUFFICIENT };
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

/**
 * Node: Generate Without KB
 * Handles intents that do NOT need retrieval context:
 *   - CHAT → warm conversational response via LLM
 *   - OUT_OF_SCOPE → deterministic refusal
 */
const generateWithoutKbNode = async (state: typeof AgentState.State) => {
  const { question, username, intent } = state;
  const { ollamaService } = await import("../../server.js");

  // OUT_OF_SCOPE → deterministic refusal (no LLM generation)
  if (intent === Intent.OUT_OF_SCOPE) {
    logger.info(`--- HANDLING OUT_OF_SCOPE directly ---`);
    const deterministicResponse = renderResponse("responses/res_out_of_scope.njk");

    return {
      generation: deterministicResponse,
      evalMetadata: { ...state.evalMetadata, isDeterministic: true, isOutOfScope: true }
    };
  }

  // CHAT → warm conversational response
  logger.info(`--- HANDLING simple chat/greeting ---`);
  const result = await ollamaService.generate(username, question, [], intent);
  return {
    generation: result.response,
    evalMetadata: { ...state.evalMetadata, isChat: true, isDeterministic: false }
  };
};

/**
 * Node: Generate With KB
 * Handles intents that need retrieval context:
 *   - MEDICAL_QUERY → standard RAG (strict rules → LLM with KB docs → fallback)
 *   - EMERGENCY → deterministic strictAnswer via service_desk knowledge rule
 */
const generateWithKbNode = async (state: typeof AgentState.State) => {
  const { question, documents, username, contextStatus, intent } = state;
  const { ollamaService } = await import("../../server.js");

  // Path A: Sufficient Context → RAG Generation
  if (contextStatus === ContextStatus.SUFFICIENT) {
    logger.info(`--- GENERATING RAG response ---`);
    
    // Check for Priority Strict Rule (Pre-generation bypass)
    const strictDoc = documents.find(d => d.metadata?.strictAnswer && (d.similarity || 0) >= 0.95);
    if (strictDoc && strictDoc.metadata) {
      logger.info(`--- DETERMINISTIC Answer triggered for: ${strictDoc.title} ---`);
      
      const deterministicResponse = renderResponse("responses/res_strict_rule.njk", {
        answer: strictDoc.metadata.strictAnswer,
        isManIntervention: strictDoc.metadata.isManIntervention,
        suggested_actions: strictDoc.metadata.suggested_actions
      });

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

  // Path B: Insufficient Context → Fallback to Rules (e.g. Technician Handover)
  logger.info(`--- CONTEXT INSUFFICIENT for medical query, checking for fallback rules ---`);
  const knowledgeBase = KnowledgeBase.getInstance();
  const fallbacks = await knowledgeBase.searchRelevant(question);
  const strictFallback = fallbacks?.find(d => d.metadata?.strictAnswer);

  if (strictFallback && strictFallback.metadata) {
    logger.info(`--- FALLBACK RULE triggered: ${strictFallback.title} ---`);
    
    const deterministicResponse = renderResponse("responses/res_strict_rule.njk", {
        answer: strictFallback.metadata.strictAnswer,
        isManIntervention: strictFallback.metadata.isManIntervention,
        suggested_actions: strictFallback.metadata.suggested_actions
    });

    return {
      generation: deterministicResponse,
      evalMetadata: { ...state.evalMetadata, isDeterministic: true, isFallback: true }
    };
  }

  // Path C: Complete Miss → Hardcode Service Desk Handover
  logger.info(`--- NO RULES found, escalating to Service Desk ---`);
  const fallbackResponse = renderResponse("responses/res_escalation.njk");

  return {
    generation: fallbackResponse,
    evalMetadata: { ...state.evalMetadata, isDeterministic: true, isFallback: true }
  };
};

/**
 * Node: Submission / Ticket Flow
 * Handles all ticket-related intents by routing to appropriate endpoints:
 *   - TICKET_SUBMIT → extract data via LLM → POST /agent/submit
 *   - TICKET_GET → fetch tickets via GET /agent/tickets
 *   - TICKET_PROCESS → escalate to service desk via POST /agent/monitoring
 */
const submitNode = async (state: typeof AgentState.State) => {
  const { question, username, intent } = state;
  const { ollamaService } = await import("../../server.js");

  // ── TICKET_GET: Fetch existing tickets ────────────────────
  if (intent === Intent.TICKET_GET) {
    logger.info(`--- TICKET_GET: Fetching tickets for ${username} ---`);
    try {
      const res = await fetch(`${serverHost}/agent/tickets?createdBy=${username}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const tickets = await res.json() as any[];

      if (!tickets || tickets.length === 0) {
        return {
          generation: renderResponse("responses/res_ticket_list.njk", { answer: "You currently have no tickets." }),
          evalMetadata: { ...state.evalMetadata, isTicketGet: true, ticketCount: 0 },
        };
      }

      const summary = tickets
        .map((t: any) => `• [${t.status}] ${t.title} (ID: ${t.id})`)
        .join("\\n");
      
      return {
        generation: renderResponse("responses/res_ticket_list.njk", { answer: `Here are your tickets:\\n${summary}` }),
        evalMetadata: { ...state.evalMetadata, isTicketGet: true, ticketCount: tickets.length },
      };
    } catch (error) {
      logger.error("Error fetching tickets", error);
      return {
        generation: renderResponse("responses/res_ticket_list.njk", { answer: "Sorry, I was unable to retrieve your tickets. Please try again later." }),
        evalMetadata: { ...state.evalMetadata, isTicketGet: true, error: true },
      };
    }
  }

  // ── TICKET_PROCESS: Service desk escalation (Monitoring) ──
  if (intent === Intent.TICKET_PROCESS) {
    logger.info(`--- TICKET_PROCESS: Escalating to service desk ---`);
    
    // Call monitoring endpoint for TICKET_PROCESS to ensure visibility
    await fetch(`${serverHost}/agent/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            conversation: { user: question, bot: "Escalating ticket process request" },
            isManIntervention: true,
            evalMetadata: { ...state.evalMetadata, intent: Intent.TICKET_PROCESS }
        })
    });

    return {
      generation: renderResponse("responses/res_escalation.njk", { 
        answer: "Ticket modifications are handled by our service desk team. I have escalated your request, and a technician will contact you shortly." 
      }),
      evalMetadata: { ...state.evalMetadata, isTicketProcess: true },
    };
  }

  // ── TICKET_SUBMIT: Extract and create ticket ──────────────
  logger.info(`--- TICKET_SUBMIT: Processing submission ---`);
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
  const isManIntervention = state.documents.some(d => d.metadata?.isManIntervention) || state.contextStatus === ContextStatus.INSUFFICIENT;

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
 *   - CHAT / OUT_OF_SCOPE         → generate-without-kb
 *   - MEDICAL_QUERY / EMERGENCY   → retrieve (KB path)
 *   - TICKET_*                    → submit
 */
const routeAfterRouter = (state: typeof AgentState.State): string => {
  const { intent } = state;

  if (intent === Intent.CHAT || intent === Intent.OUT_OF_SCOPE) {
    return "generate-without-kb";
  }
  if (intent === Intent.TICKET_SUBMIT || intent === Intent.TICKET_GET || intent === Intent.TICKET_PROCESS) {
    return "submit";
  }
  // MEDICAL_QUERY, EMERGENCY → retrieve
  return "retrieve";
};

// Build the Graph with Multi-Stage Routing
const workflow = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("retrieve", retrieveNode)
  .addNode("ranker", rankerNode)
  .addNode("generate-without-kb", generateWithoutKbNode)
  .addNode("generate-with-kb", generateWithKbNode)
  .addNode("submit", submitNode)
  .addNode("analyze", analyzeNode)

  // Edge Flow
  .addEdge(START, "router")
  .addConditionalEdges("router", routeAfterRouter, {
    "generate-without-kb": "generate-without-kb",
    "retrieve": "retrieve",
    "submit": "submit",
  })
  .addEdge("retrieve", "ranker")
  .addEdge("ranker", "generate-with-kb")
  .addEdge("generate-without-kb", "analyze")
  .addEdge("generate-with-kb", "analyze")
  .addEdge("submit", "analyze")
  .addEdge("analyze", END);

/**
 * Compiled LangGraph agent.
 */
export const agentGraph = workflow.compile();
