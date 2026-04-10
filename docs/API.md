# XCare Server — API Reference

Base URL: `http://localhost:5002`

All endpoints requiring authentication expect a JWT Bearer token:
```
Authorization: Bearer <token>
```

---

## Table of Contents
- [Authentication](#authentication)
- [Chat Generation](#chat-generation)
- [Tickets](#tickets)
- [Analytics & Monitoring](#analytics--monitoring)
- [Knowledge Base Management](#knowledge-base-management)

---

## Authentication

### `POST /agent/login`
Authenticates a user and returns a JWT token.

**Auth Required:** No

**Request Body:**
```json
{
  "username": "tienpham",
  "password": "tienpham"
}
```

**Response `200`:**
```json
{
  "user": {
    "id": 1,
    "fullname": "Tien Pham",
    "username": "tienpham",
    "gender": "Male",
    "age": "30",
    "email": "tienpham@example.com",
    "user_type": "Patient"
  },
  "token": "<jwt_token>"
}
```

---

### `GET /agent/user`
Returns user profile by username. Used internally by the prompt factory to inject user context into prompts.

**Auth Required:** No *(internal use)*

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `username` | string | The user's username |

**Response `200`:**
```json
{
  "id": 1,
  "fullname": "Tien Pham",
  "username": "tienpham",
  "email": "tienpham@example.com",
  "gender": "Male",
  "age": "30",
  "user_type": "Patient",
  "credentials": {}
}
```

---

## Chat Generation

### `POST /agent/generate`
The primary endpoint. Invokes the LangGraph agent pipeline and returns an AI-generated response grounded in the knowledge base.

**Auth Required:** Yes

**Request Body:**
```json
{
  "prompt": "I have a headache, what should I do?",
  "username": "tienpham",
  "messageType": "general",
  "sessionId": "abc-123",
  "model": "llama3"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | ✅ | The user's message |
| `username` | string | ✅ | Used to fetch user context |
| `messageType` | string | ✅ | `"general"` for medical queries, `"submit"` to trigger ticket creation |
| `sessionId` | string | No | Session identifier for conversation threading |
| `model` | string | No | Ollama model name override (default: `llama3`) |

**Response `200`:**
```json
{
  "sessionId": "abc-123",
  "conversation": {
    "model": "llama3",
    "message": [
      { "role": "user", "content": "I have a headache..." },
      { "role": "bot", "content": "***{\"answer\": \"Mild symptoms...\", \"isManIntervention\": false}***" }
    ],
    "metadata": {
      "currentState": "langgraph_managed",
      "sessionData": { "intentReasoning": "...", "isDeterministic": false }
    }
  },
  "debug": {
    "intentReasoning": "Query classified as MEDICAL_QUERY",
    "retrievalCount": 3,
    "isDeterministic": false,
    "requiresHumanIntervention": false
  }
}
```

> [!NOTE]
> The LLM response inside `conversation.message[1].content` is wrapped in triple asterisks `***{...}***`. Both `xcare-web` and the server parse this with a JSON extractor utility.

**Intent Routing:**

| `messageType` | Intent | Description |
|---|---|---|
| `"general"` | Auto-classified | LLM classifies as `CHAT`, `MEDICAL_QUERY`, or `EMERGENCY` |
| `"submit"` | `TICKET` (forced) | Bypasses LLM classification, immediately routes to ticket extraction |

---

## Tickets

### `GET /agent/tickets`
Returns all tickets created by a specific user.

**Auth Required:** Yes

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `createdBy` | string | Username of the ticket creator |

**Response `200`:**
```json
[
  {
    "id": 1,
    "title": "Doctor Appointment Request",
    "content": "Patient reports severe headache and requests an appointment.",
    "createdBy": "tienpham",
    "email": "tienpham@example.com",
    "status": "Open",
    "createdDate": "2026-04-10T12:00:00.000Z"
  }
]
```

---

### `POST /agent/submit`
Creates a new support ticket directly (bypasses the AI pipeline). This is called internally by `submitTicket()` once the LLM has extracted the structured data.

**Auth Required:** No *(internal use)*

**Request Body:**
```json
{
  "title": "Doctor Appointment Request",
  "content": "Patient reports severe headache and requests appointment.",
  "createdBy": "tienpham",
  "email": "tienpham@example.com"
}
```

**Response `200`:**
```json
{
  "id": 5,
  "title": "Doctor Appointment Request",
  "content": "Patient reports severe headache and requests appointment.",
  "createdBy": "tienpham",
  "email": "tienpham@example.com",
  "status": "Open",
  "createdDate": "2026-04-10T12:00:00.000Z"
}
```

---

## Analytics & Monitoring

### `POST /agent/analytic`
Records a user's thumbs up/down vote on a bot response for continuous improvement.

**Auth Required:** No

**Request Body:**
```json
{
  "conversation": {
    "user": "I have a headache",
    "bot": "Mild symptoms can be treated at home..."
  },
  "vote": "up",
  "evalMetadata": {}
}
```

---

### `POST /agent/monitoring`
Records conversations that required human intervention for audit and alerting purposes. Called automatically by the server when `isManIntervention: true`.

**Auth Required:** No *(internal use)*

**Request Body:**
```json
{
  "conversation": {
    "user": "This is an emergency!",
    "bot": "Please wait! A technician will assist you shortly."
  },
  "isManIntervention": true,
  "evalMetadata": {}
}
```

---

## Knowledge Base Management

### `GET /agent/knowledge`
Returns all structured knowledge rules (document-centric format).

**Auth Required:** No

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "documentId": "symp-001",
    "title": "Treatment for Mild Symptoms",
    "domain": "symptoms",
    "content": "Mild symptoms include headache...",
    "metadata": {
      "suggested_actions": [{ "label": "Talk to an Online Doctor", "targetDomain": "contacts" }]
    },
    "isActive": true,
    "createdAt": "2026-04-10T12:00:00.000Z",
    "updatedAt": "2026-04-10T12:00:00.000Z"
  }
]
```

---

### `POST /agent/knowledge`
Creates a new knowledge rule and adds it to the relational store.

> [!NOTE]
> This does **not** automatically add the document to the vector embeddings store. Run `/agent/knowledge/reinitialize` to fully sync the vector store.

**Auth Required:** No

**Request Body:**
```json
{
  "documentId": "symp-003",
  "title": "Chronic Fatigue Management",
  "domain": "symptoms",
  "content": "Chronic fatigue is characterized by...",
  "metadata": {
    "suggested_actions": [{ "label": "Contact Us", "targetDomain": "contacts" }]
  }
}
```

---

### `PATCH /agent/knowledge/:id`
Updates an existing knowledge rule by its UUID.

**Auth Required:** No

**Request Body** *(any subset of fields)*:
```json
{
  "isActive": false
}
```

---

### `DELETE /agent/knowledge/:id`
Permanently deletes a knowledge rule by its UUID.

**Auth Required:** No

**Response `200`:**
```json
{ "success": true }
```

---

### `POST /agent/knowledge/reinitialize`
Triggers a full re-ingestion of the knowledge base — clears all rules and vector embeddings and re-seeds from the JSON files in `prisma/seeds/knowledge/`.

> [!CAUTION]
> This operation will delete all existing `KnowledgeRule` records and vector embeddings before re-ingesting. Use with care in production.

**Auth Required:** No

**Response `200`:**
```json
{
  "success": true,
  "message": "Knowledge base re-initialized successfully"
}
```
