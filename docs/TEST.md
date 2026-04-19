# xcare-server Testing Blueprint

XCare uses a multi-layered testing strategy designed to validate both deterministic logic and the non-deterministic behavior of our AI RAG pipeline.

---

## 🏗 Test Architecture

We organize our testing into three distinct layers, increasing in complexity and dependency requirements.

### 2.1 Test Layers

```mermaid
graph TD
    subgraph Layer 1: Isolation
        Unit[Unit Tests]
    end
    
    subgraph Layer 2: Connectivity
        Retrieval[Retrieval Integration]
        API[API Integration]
    end
    
    subgraph Layer 3: Intelligence
    	Eval[RAG Pipeline Evaluation]
    end
    
    Unit --> |Validates Logic| Retrieval
    Retrieval --> |Validates Data Flow| API
    API --> |Validates End-to-End| Eval
```

---

### 2.2 Unit Tests (Logic & Services)

**Purpose**: To validate internal utilities and core business services in total isolation from the database, external APIs, and the LLM.

- **Path**: `tests/unit/`
- **Mocking Strategy**: We use `mock.module` to intercept the lowest-level dependencies (Prisma client, LangChain providers, and HTTP fetch).
- **Run Command**: `bun test tests/unit`

#### Service Breakdown Diagrams:

#### A. AuthService Flow
Focuses on credential validation and JWT issuance logic without hitting the real database.
```mermaid
graph LR
    Test([unit/authService.test.ts]) --> AuthService
    AuthService -- "prisma.user.findUnique()" --> MockPrisma{Mock Prisma Client}
    MockPrisma -- "Returns fake User" --> AuthService
    AuthService -- "Signs JWT" --> Result[Validated Token]
```

#### B. OllamaService Flow
Validates prompt construction, intent parsing, and service-desk automation.
```mermaid
graph TD
    Test([unit/ollamaService.test.ts]) --> OllService[OllamaService]
    OllService -- "llm.invoke()" --> MockLLM{Mock ChatOllama}
    OllService -- "fetch('/agent/submit')" --> MockFetch{Mock Global Fetch}
    MockLLM -- "Returns JSON String" --> OllService
    MockFetch -- "Returns 200 OK" --> OllService
    OllService -- "parseAnswer()" --> Result[Structured JSON Response]
```

#### C. KnowledgeBase Flow
Tests the crucial **Priority Logic**: ensuring Hard-Coded matches take precedence over Semantic Search.
```mermaid
graph TD
    Test([unit/kb.unit.test.ts]) --> KB[KnowledgeBase]
    KB -- "prisma.findMany()" --> MockPrisma{Mock Database}
    KB -- "searchPath" --> MockVector{Mock PGVectorStore}
    
    subgraph Priority Logic
        MockPrisma -- "If Match Found" --> Return[Return High-Sim Result]
        MockPrisma -- "If No Match" --> MockVector
        MockVector -- "Semantic Match" --> Return
    end
```

#### D. AgentGraph Flow
Orchestrates the entire multi-node RAG pipeline using state-machine logic.
```mermaid
graph TD
    Test([unit/agentGraph.test.ts]) --> Graph[StateGraph]
    
    subgraph Nodes
        Router[Router Node]
        Retriever[Retriever Node]
        Generator[Generator Node]
    end
    
    Graph --> |Loads| Router
    Router -- "import('../../server')" --> MockServer{Mock Server Module}
    MockServer -- "Provides Mock Services" --> Router
    
    Router --> Retriever --> Generator
```

---

### 2.3 Integration Tests

Integration tests verify that different components of the system work together and that we can correctly communicate with external resources.

#### A. Retrieval Tests (Search Accuracy)
- **Path**: `tests/integration/retrieval.test.ts`
- **Purpose**: Verifies the hybrid search logic (Strict Rules + Vector Search) against a live PostgreSQL instance.
- **Verification**: Checks if the most relevant document for a specific medical query is actually returned with a high similarity score.

#### B. API Integration Tests
- **Path**: `tests/integration/api.test.ts`
- **Purpose**: Validates the HTTP interface. Ensures that middleware (Auth), status codes, and JSON response structures meet the API contract.
- **Verification**: Performs real HTTP requests to the running express server on port 5002.

#### C. RAG Pipeline Evaluation (Promptfoo)
- **Path**: `promptfooconfig.yaml` and `tests/evals/`
- **Purpose**: A comprehensive end-to-end evaluation of the "Intelligence" layer using **Promptfoo**. Models real user requests through the full LangGraph context pipeline.
- **Evaluation Mechanism**: 
  - **Retrieval Suite** (`retrieval.yaml`): Uses binary deterministic assertions (`icontains`) to test systemic logic (e.g., hardcoded service desk handovers and grounding rules).
  - **Generation Suite** (`generation.yaml`): Uses **Scored Evals**. Leverages an explicit judge model (`llama3.1:8b`) to score *factuality* (anti-hallucination checks) and an embedding model (`mxbai-embed-large:335m`) for mathematical semantic *similarity* against target answers using strict passing thresholds.

---

## 🚀 Setup & Execution

### Prerequisites
1. **Docker**: Must be installed and running.
2. **Ports**: Ensure ports `5432` (DB), `11434` (Ollama), and `5002` (Server) are not being used by other applications.

### 🧪 Running Tests
We provide a **Zero-Config** testing environment. The background orchestration scripts handle everything.

#### 1. Unit Tests (Isolated)
Use this for lightning-fast feedback on internal logic. No database or server is required.
```bash
bun run test:unit
```

#### 2. Integration Tests (Full Orchestration)
Runs the integration suite with a full environment lifecycle.
```bash
bun run test:integration
```

**What happens behind the scenes:**
- **Docker**: Automatically runs `docker compose up -d` to start Postgres and Ollama.
- **Health Checks**: Waits for DB and Ollama ports to become responsive.
- **Model Management**: Uses the Ollama API to **automatically pull** `llama3` and `mxbai-embed-large` if they are missing.
- **Server Boot**: Starts the Express server in the background and waits for it to bind to port `5002`.
- **Teardown**: After tests finish (even if they fail), it kills the server and runs `docker compose down`.

#### 3. RAG Pipeline Evaluations (Promptfoo)
Runs the LLM-as-a-Judge semantic scoring matrices to evaluate medical accuracy and anti-hallucination.
```bash
bun run test:eval
bun run test:eval:retrieval
bun run test:eval:generation
```

**What happens behind the scenes:**
- Bootstraps the local environment natively using the `pre-test.sh` orchestration script.
- Evaluates outputs using our pre-downloaded, pinned model weights (`llama3:8b`, `llama3.1:8b`, `mxbai-embed-large:335m`) to ensure **100% CI determinism**.

#### 4. Full Suite (Recommended)
Sequentially runs Unit Tests, Integration Tests, and the RAG Evaluations with automatic cleanup between phases.
```bash
bun run test:all
```

---

## 🛠 Troubleshooting

### Port Conflicts (5002)
The tests and the server use port `5002`. If a previous process is hanging:
```bash
lsof -ti:5002 | xargs kill -9
```

---

## 📈 Quality Metrics

We leverage Promptfoo's advanced model-graded assertions for rigorous medical testing:
- **Factuality**: Using the `llama3.1:8b` judge to mathematically verify the LLM has not hallucinated medical instructions beyond the provided dataset.
- **Semantic Similarity (`similar`)**: Validating structural content like pricing maps with `0.80`-threshold contextual embeddings inside `mxbai-embed-large:335m`.
- **Deterministic Handovers**: Guaranteeing complex, unsourced medical queries fallback to live clinicians safely (`isManIntervention: true`).
