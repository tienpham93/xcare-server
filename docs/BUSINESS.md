# XCare AI: Business Overview

## Mission Statement
XCare AI is a medical technology platform that bridges the gap between patients and professional healthcare services. By embedding state-of-the-art Generative AI and a hybrid RAG (Retrieval-Augmented Generation) architecture, XCare delivers instant, reliable, and safe medical support — 24 hours a day, 7 days a week.

Our goal is to reduce unnecessary pressure on clinical staff by automating routine inquiries, symptom guidance, and service navigation, while always ensuring that high-risk cases are escalated to human technicians.

---

## Target Audience
| Persona | Need |
|---|---|
| **Patients** | Quick, reliable answers about symptoms, appointment costs, diets, and medical packages |
| **Medical Staff** | A first-line support layer that automatically handles common queries so clinicians can focus on critical cases |
| **Healthcare Administrators** | An auditable, analytics-driven system to track patient interactions, ticket volumes, and escalation rates |
| **Healthcare Providers** | A customizable AI assistant that speaks with a consistent, professional brand voice |

---

## Core Features

### 🤖 Agentic AI Chat
An AI-powered chat assistant capable of:
- Answering questions about **symptoms**, **diet recommendations**, **medical packages**, and **billing**
- Routing the conversation to a **human technician** in all emergency or out-of-scope scenarios
- Handling **ticket creation** directly from the chat window via natural language (e.g. "submit a ticket about my headache")

### 🧠 Hybrid Safety Architecture
The system uses a two-tier retrieval strategy for guaranteed reliability:
1. **Deterministic Path**: Emergency and SOS queries trigger pre-defined `strictAnswer` rules immediately, bypassing LLM generation for 100% predictability.
2. **Semantic RAG Path**: General queries retrieve the top relevant documents from the vector store and pass them to the LLM for context-grounded responses.

### 🎯 Multi-Domain Intent Router
Powered by LangGraph, the agent intelligently classifies every message before acting:
- `CHAT`: Friendly greetings bypass the medical pipeline entirely
- `MEDICAL_QUERY`: Routed to the hybrid knowledge base for context-grounded answers
- `TICKET`: Automatically extracts structured ticket data from the user's message and creates a support ticket in the database
- `EMERGENCY`: Triggers immediate human intervention

### 💡 Proactive UI Suggestions
After answering a query, the system provides `suggested_actions` from the document metadata, which the frontend renders as quick-reply buttons. For example, after answering a symptoms query, the system may suggest "Talk to an Online Doctor" or "View Consultation Fees."

### 📊 Analytics & Monitoring
Every conversation is audited with:
- Intent classification reasoning
- Relevance and similarity scores
- Flags for human intervention
- Vote-based feedback (thumbs up/down) recorded for continuous improvement

---

## Current System Architecture

```
[xcare-web] React Frontend
    ↓   (BFF: Next.js Express Layer)
[xcare-server] Express + LangGraph Agent
    ↓
[Retrieval Layer]
    ├── PostgreSQL KnowledgeRule (Deterministic)
    └── pgvector knowledge_embeddings (Semantic)
    ↓
[Ollama LLM: llama3]
```

---

## Future Roadmap
- **Real-time Appointment Booking**: Deep integration with hospital scheduling systems.
- **Secure Medical History Integration**: Personalized advice based on the patient's own records.
- **Multi-lingual Support**: Reaching international patients and diverse demographics.
- **Real-time Web Search**: Integration of verified medical journals for the most up-to-date health advice.
- **Analytics Dashboard**: A dedicated admin view to monitor conversation trends, common topics, and escalation rates.
