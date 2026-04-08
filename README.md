The service provides:
- **Hybrid RAG**: Combined Deterministic Rules (relational) + Semantic Retrieval (vector).
- **Management APIs**: Full CRUD for knowledge rules (topic, content, strict answer).
- **JWT-authenticated** chat generation with retrieval-augmented context.
- **Ticket submission** and retrieval with audit trails.
- **Analytics & Monitoring**: event capture for professional evaluation.

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript
- **API**: Express
- **LLM**: Ollama (`llama3` default)
- **Embeddings**: Ollama (`mxbai-embed-large` default)
- **Orchestration**: LangGraph + LangChain
- **Templating**: Nunjucks (for robust prompt engineering)
- **Vector Storage**: pgvector (via PostgreSQL)
- **ORM**: Prisma (using Prisma 7 Driver Adapter for PostgreSQL)

## Quick Start

### 1) Prerequisites
- Bun installed
- Docker installed
- Ollama installed and running

Pull required models:

```bash
ollama pull llama3
ollama pull mxbai-embed-large
```

### 2) Install dependencies

```bash
bun install
```

### 3) Start PostgreSQL (pgvector)

```bash
docker-compose up -d
```

### 4) Configure environment

Create a `.env` file in project root:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/xcare?schema=public"

# Optional overrides used by RAG connection
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=password
PG_DB=xcare

# Optional: set true to rebuild embeddings from prisma/seeds/knowledge
REINITIALIZE_KB=false
```

### 5) Run migrations

```bash
bunx prisma migrate dev
```

### 6) Run the API

Development:

```bash
bun run dev
```

Production build + run:

```bash
bun run start
```

Server default: `http://localhost:5002`

## Scripts

```bash
bun run dev        # watch mode
bun run build      # compile TypeScript to dist/
bun run start      # build then run dist/server.js
bun run test       # run Bun tests
bun run test:watch # watch tests
```

## API Endpoints

The server provides a comprehensive set of REST APIs for chat generation, auth, ticket management, and knowledge base administration.

> [!NOTE]
> For a detailed list of all endpoints, request/response schemas, and examples, please refer to the **[API Documentation (API.md)](./API.md)**.

### Quick Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/agent/login` | No | Authenticate and get JWT |
| POST | `/agent/generate` | Yes | Hybrid chat response (Strict Rule or RAG) |
| GET | `/agent/tickets`| Yes | Get tickets by creator |
| GET | `/agent/knowledge` | Yes | List all knowledge rules |
| POST | `/agent/knowledge/reinitialize` | Yes | Rebuild Vector + Rule store |


## Hybrid Knowledge Base Architecture

The system uses a two-tier retrieval strategy:

```mermaid
graph TD
    A[User Request] --> B{Retrieve Knowledge}
    
    subgraph "Hybrid Retrieval Service"
        B --> C[Path 1: Deterministic Rules<br/><i>PostgreSQL Relational</i>]
        B --> D[Path 2: Semantic RAG<br/><i>pgvector Embeddings</i>]
    
        C --> E{Rule Match?}
        D --> F{Similarity Score > 0.4?}
    end
    
    E -- Yes --> G[Strict Answer Bypass]
    E -- No --> D
    
    F -- Yes --> H[LLM Generation<br/><i>llama3 + Context</i>]
    F -- No --> J[General LLM<br/><i>Baseline Knowledge</i>]
    
    G --> K[Final Bot Response]
    H --> K
    J --> K
```

1. **Deterministic Path (Rules)**: High-stakes or strict-workflow queries (e.g., "Emergency", "SOS") match records in the `KnowledgeRule` table. If a match is found, a `strictAnswer` is returned immediately, bypassing the LLM for 100% predictability.
2. **Semantic Path (Vector)**: General queries use `pgvector` similarity search to find relevant context chunked by `RecursiveCharacterTextSplitter`, which is then passed to the LLM for response generation.

### Traceability
Every response includes a `debug` (metadata) object containing:
- `isDeterministic`: Boolean indicating if a strict rule was used.
- `ruleId`: The ID of the specific rule matched.
- `retrievalCount`: Number of documents retrieved for the LLM.

## Prompt Management

The system uses **Nunjucks** templates for robust and maintainable prompt engineering.

- **Templates**: Located in `src/prompt/templates/`.
- **Logic-Code Separation**: Prompt instructions and personas are kept in `.njk` files, separate from the TypeScript logic.
- **Optimized Formatting**: Uses XML-style tags (`<context>`, `<rules>`) to provide clear structural anchors for the LLM.
- **Few-Shot Learning**: Included examples in extraction templates to ensure high-accuracy JSON output.

## Database Model Overview

Prisma models:
- `User`
- `Ticket`
- `Analytic`
- `Monitoring`
- `KnowledgeRule` (Relational rules)
- `KnowledgeEmbedding` (Vector storage with UUID)

## Testing

Current tests are Bun integration tests in `tests/api.test.ts`.

Run:

```bash
bun run test
```

## Notes and Caveats
- `prisma/seed.ts` expects JSON files under `prisma/seeds/` to populate the initial database state.
- JWT secret is currently hardcoded in `src/services/authService.ts` (recommended: move to env var).
- Playwright and Jest configs exist, but active test coverage is currently Bun-based.
