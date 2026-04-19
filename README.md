# XCare Server — AI Medical Support API

> An agentic, LangGraph-powered backend that combines Hybrid RAG, deterministic rule-matching, and multi-domain intent routing to deliver accurate, safe medical support responses.

The service provides:
- **Hybrid Document RAG**: Deterministic Rules (relational) + Semantic Retrieval (pgvector).
- **Agentic Graph Pipeline**: `router` → `retrieve` → `ranker` → `generate` / `submit` → `analyze`
- **Management APIs**: Full CRUD for knowledge rules (`documentId`, `title`, `domain`, `content`, `metadata`).
- **JWT-authenticated** chat generation with retrieval-augmented context.
- **Ticket Submission via Chat**: Natural language ticket creation from within the chat UI.
- **Analytics & Monitoring**: Vote capture and automated human-intervention audit logging.

## 🏢 Business Context
For detailed information regarding the startup's mission, target audience, and key value propositions, please refer to the **[Business Overview](./docs/BUSINESS.md)**.

---

## Tech Stack
| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh/) |
| Language | TypeScript |
| API | Express |
| Orchestration | LangGraph + LangChain |
| LLM | Ollama (`llama3` default) |
| Embeddings | Ollama (`mxbai-embed-large`) |
| Evaluation | Promptfoo (`llama3.1` judge) |
| Templating | Nunjucks |
| Vector Storage | pgvector (via PostgreSQL) |
| ORM | Prisma 7 |

---

## Quick Start

### Part 1 — Installation

**Prerequisites:**
- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/)
- [Ollama](https://ollama.com/)

**1. Install Ollama**

Download from [ollama.com/download](https://ollama.com/download) or install via terminal:

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Then pull the required models:

```bash
ollama pull llama3
ollama pull mxbai-embed-large
```

> [!TIP]
> Verify models are ready: `ollama list` should show both `llama3` and `mxbai-embed-large`.

**2. Install project dependencies**

```bash
bun install
```

**3. Configure environment**

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/xcare?schema=public"

# Optional overrides used by RAG connection
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=password
PG_DB=xcare

# Set to true to force a full re-ingestion of prisma/seeds/knowledge
REINITIALIZE_KB=false

# Optional: override server port (default 5002)
PORT=5002
```

**4. Start PostgreSQL (with pgvector)**

```bash
docker-compose up -d db
```

> [!IMPORTANT]
> If you also want to run Ollama inside Docker (instead of locally), use `docker-compose up -d` — but quit the local Ollama Mac App first to avoid a port conflict on `11434`.

**5. Push schema & generate Prisma client**

```bash
bunx prisma db push
bunx prisma generate
```

---

### Part 2 — Start the App

**First run** — ingests all knowledge base documents into PostgreSQL + pgvector:

```bash
REINITIALIZE_KB=true bun run start
```

**Subsequent runs** — connects to the existing vector store (fast):

```bash
bun run start
```

**Development mode** (hot reload):

```bash
bun run dev
```

Server runs at: `http://localhost:5002`

---


## Scripts

```bash
bun run dev          # Watch mode (hot reload)
bun run build        # Compile TypeScript → dist/
bun run start        # Build + run dist/server.js
bun run test         # Run Bun integration tests
bun run test:watch   # Watch tests
```

---

## API Endpoints

The server provides a comprehensive set of REST APIs for chat generation, auth, ticket management, and knowledge base administration.

> [!NOTE]
> For a detailed list of all endpoints, request/response schemas, and examples, please refer to the **[API Documentation](./docs/API.md)**.

### Quick Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/agent/login` | No | Authenticate and get JWT |
| GET | `/agent/user` | No | Get user profile by username |
| POST | `/agent/generate` | Yes | Agentic chat (RAG + routing + generation) |
| GET | `/agent/tickets` | Yes | Get tickets by creator username |
| POST | `/agent/submit` | No | Create a support ticket (internal) |
| POST | `/agent/analytic` | No | Record a thumbs-up/down vote |
| POST | `/agent/monitoring` | No | Log human-intervention events |
| GET | `/agent/knowledge` | No | List all knowledge rules |
| POST | `/agent/knowledge` | No | Add a new knowledge rule |
| PATCH | `/agent/knowledge/:id` | No | Update a knowledge rule |
| DELETE | `/agent/knowledge/:id` | No | Delete a knowledge rule |
| POST | `/agent/knowledge/reinitialize` | No | Full KB re-ingestion |

---

## Agent Graph Architecture

The request flows through a multi-stage LangGraph pipeline:

```mermaid
graph TD
    A["User Message"] --> B["router"]

    subgraph "LangGraph Agent"
        B -- "messageType=submit" --> E["submit"]
        B -- "CHAT" --> D["generate"]
        B -- "MEDICAL/EMERGENCY" --> C["retrieve"]
        C --> R["ranker"]
        R -- "TICKET intent" --> E
        R -- "sufficient context" --> D
        D --> F["analyze"]
        E --> F
    end

    F --> G["Final Response"]
```

### Intent Types
## 🧪 Testing Architecture

We use a **3-tier testing strategy** powered by `bun:test`. For a deep dive into our testing philosophy, setup, and troubleshooting, see the **[Testing Documentation](./docs/TEST.md)**.

### Quick Commands
| Type | Target | Command |
|---|---|---|
| **Logic** | Unit Tests | `bun test tests/unit` |
| **Connectivity**| Integration Tests| `bun test tests/integration` |
| **AI Accuracy** | Promptfoo Evals | `bun run test:eval` |
| **Full Suite** | All Tests | `bun run test:all` |

---

## 🛠 Lessons & Architecture Decisions
- **Document-Centric RAG**: We transitioned from keyword rules to a structured `id/title/content/metadata` schema to improve semantic search precision.
- **TICKET Precedence**: The router is explicitly tuned to prioritize ticket submission keywords over medical symptom matching, ensuring a smooth user experience for support requests.
- **Suggested Actions**: Metadata-driven quick replies are now first-class citizens in the AI response, allowing for a more interactive and proactive UI.

---

## Notes and Caveats
- **Port 5002**: The server and tests use port `5002`. If tests fail with "Address in use", run `lsof -ti:5002 | xargs kill -9`.
- **Ollama Models**: Ensure `llama3`, `llama3.1`, and `mxbai-embed-large` are installed locally via `ollama pull`. The evaluation pipeline will attempt to download them implicitly if missing.
- **JWT Security**: The secret is currently hardcoded for development. Move to `JWT_SECRET` in `.env` for production.

---

## Knowledge Base Schema

The knowledge base uses a **Document-Centric** format. Each entry in `prisma/seeds/knowledge/*.json` follows this structure:

```json
{
  "documentId": "symp-001",
  "title": "Treatment for Mild Symptoms",
  "domain": "symptoms",
  "content": "Mild symptoms include headache, toothache, fever...",
  "metadata": {
    "suggested_actions": [
      { "label": "Talk to an Online Doctor", "targetDomain": "contacts" }
    ],
    "severity": "low"
  }
}
```

| Field | Description |
|---|---|
| `documentId` | Unique stable identifier for updates/deletes |
| `title` | Primary semantic anchor — heavily weighted in vector search |
| `domain` | Domain filter used by the intent router (`symptoms`, `billing`, etc.) |
| `content` | Full-text body embedded in the vector store |
| `metadata.suggested_actions` | UI quick-reply suggestions rendered by the frontend |
| `metadata.strictAnswer` | If present, bypasses LLM — returned verbatim |
| `metadata.isManIntervention` | If true, triggers a human technician alert |

---

## Prompt Templates

Located in `src/prompt/templates/`. Powered by **Nunjucks** for clean logic-code separation.

| Template | Used For |
|---|---|
| `general.njk` | Main RAG generation prompt (intent-aware) |
| `router.njk` | Intent & domain classification |
| `ranker.njk` | Context sufficiency assessment |
| `ticket_extraction.njk` | Structured ticket data extraction from user message |

---

## Database Models

| Model | Purpose |
|---|---|
| `User` | Authenticated patient/admin accounts |
| `Ticket` | Support tickets created via chat or API |
| `Analytic` | Vote records (thumbs up/down) |
| `Monitoring` | Human-intervention audit log |
| `KnowledgeRule` | Relational knowledge documents |
| `KnowledgeEmbedding` | pgvector embeddings table |

---

## Testing

Integration tests live in `tests/api.test.ts` (Bun test runner).

```bash
bun run test
# Or against a specific port:
BASE_URL=http://localhost:5003 bun test tests/api.test.ts
```

---

## Notes and Caveats
- JWT secret is currently hardcoded in `src/services/authService.ts` — recommend moving to a `.env` secret.
- The `web_search` node is scaffolded in the graph but currently disabled.
- `PORT` environment variable can override the default server port (`5002`).
