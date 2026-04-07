# XCare API Reference

This document provides detailed information about the API endpoints provided by the XCare server.

## Base URL
The default base URL for the API is `http://localhost:5002/agent`.

## Authentication
Most endpoints require a JWT bearer token. To obtain a token, use the `/login` endpoint.

Include the token in the `Authorization` header:
`Authorization: Bearer <your_token>`

---

## 1. Authentication & Users

### POST `/login`
Authenticates a user and returns a session token.

**Request Body:**
```json
{
  "username": "tienpham",
  "password": "yourpassword"
}
```

**Successful Response:**
```json
{
  "user": {
    "id": "uuid",
    "username": "tienpham",
    "fullname": "Tien Pham",
    "email": "user@example.com",
    "user_type": "Standard",
    "gender": "Male",
    "age": "30"
  },
  "token": "jwt_token_here"
}
```

---

### GET `/user`
Fetches metadata for a specific user.

**Auth Required:** No

**Query Parameters:**
- `username` (required): The username of the user to fetch.

**Successful Response:**
```json
{
  "id": "uuid",
  "username": "tienpham",
  "fullname": "Tien Pham",
  "email": "user@example.com",
  "user_type": "Standard",
  "gender": "Male",
  "age": "30",
  "credentials": {}
}
```

---

## 2. Chat & Generation

### POST `/generate`
Generates a retrieval-augmented response using the LangGraph agent. This endpoint implements the Hybrid RAG architecture (Deterministic Rules + Semantic Vector Search).

**Auth Required:** Yes

**Request Body:**
```json
{
  "prompt": "I have a headache, what should I do?",
  "username": "tienpham",
  "sessionId": "optional-session-id",
  "messageType": "general",
  "model": "llama3"
}
```

**Successful Response:**
```json
{
  "sessionId": "optional-session-id",
  "conversation": {
    "model": "llama3",
    "message": [
      { "role": "user", "content": "I have a headache..." },
      { "role": "bot", "content": "Generated answer here..." }
    ],
    "metadata": {
      "currentState": "langgraph_managed",
      "sessionData": { ... }
    }
  },
  "debug": {
    "isDeterministic": false,
    "retrievalCount": 3,
    "requiresHumanIntervention": false,
    "audit_trail": [ ... ]
  }
}
```

---

## 3. Tickets

### GET `/tickets`
Retrieves a list of tickets created by a specific user.

**Auth Required:** Yes

**Query Parameters:**
- `createdBy` (required): The username of the ticket creator.

**Successful Response:**
```json
[
  {
    "id": "uuid",
    "title": "Headache issue",
    "content": "Patient reports severe symptoms...",
    "createdBy": "tienpham",
    "createdDate": "2026-04-07T12:00:00.000Z",
    "status": "Open"
  }
]
```

---

### POST `/submit`
Creates a new support ticket.

**Auth Required:** No

**Request Body:**
```json
{
  "title": "Emergency Case",
  "content": "Description of the medical situation...",
  "createdBy": "tienpham",
  "email": "tienpham@example.com"
}
```

**Successful Response:**
```json
{
  "id": "uuid",
  "title": "Emergency Case",
  "status": "Open",
  "createdBy": "tienpham",
  "createdDate": "..."
}
```

---

## 4. Analytics & Monitoring

### POST `/analytic`
Saves user feedback (vote) for a specific bot interaction.

**Auth Required:** No

**Request Body:**
```json
{
  "conversation": {
    "user": "original prompt",
    "bot": "bot response"
  },
  "vote": 1,
  "evalMetadata": {
    "modelUsed": "llama3",
    "isDeterministic": true
  }
}
```

---

### POST `/monitoring`
Logs conversations that require human intervention or special auditing.

**Auth Required:** No

**Request Body:**
```json
{
  "conversation": {
    "user": "original prompt",
    "bot": "bot response"
  },
  "isManIntervention": true,
  "evalMetadata": { ... }
}
```

---

## 5. Knowledge Base Management

### GET `/knowledge`
Lists all structured knowledge rules.

**Auth Required:** Yes

**Successful Response:** Array of knowledge rule objects including `topic`, `content`, `strictAnswer`, etc.

---

### POST `/knowledge`
Creates a new deterministic knowledge rule.

**Auth Required:** Yes

**Request Body:**
```json
{
  "topic": "emergency",
  "category": "urgent",
  "content": "What to do in an emergency",
  "strictAnswer": "Please call 911 immediately or go to the nearest hospital.",
  "isManIntervention": true,
  "nextTopic": "follow-up",
  "metadata": {}
}
```

---

### PATCH `/knowledge/:id`
Updates an existing rule.

**Auth Required:** Yes

**Path Parameters:**
- `id`: The numeric ID of the rule.

**Request Body:** Any field existing in the knowledge rule object.

---

### DELETE `/knowledge/:id`
Deletes a knowledge rule.

**Auth Required:** Yes

**Path Parameters:**
- `id`: The numeric ID of the rule.

---

### POST `/knowledge/reinitialize`
Triggers a full re-ingestion of the knowledge base, rebuilding both structured rules and vector embeddings.

**Auth Required:** Yes

**Successful Response:**
```json
{
  "success": true,
  "message": "Knowledge base re-initialized successfully"
}
```
