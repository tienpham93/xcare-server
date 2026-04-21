# RAG Evaluation Framework — Practice Benchmark Guidelines

This document provides a technical guide on how to evaluate Retrieval-Augmented Generation (RAG) systems. It is framed as a **Practice Benchmark** to help developers and researchers understand the core metrics and methodologies required to build reliable AI pipelines.

---

## 🔍 RAG Evaluation Overview

Evaluating RAG systems required a decoupled approach. A failure in the final response can stem from two different places: the **Retriever** (finding the wrong information) or the **Generator** (misinterpreting the right information). 

To diagnose these failures, we adopt the **RAGAS** (Retrieval Augmented Generation Assessment) framework. RAGAS is the industry-standard methodology for "reference-free" evaluation, meaning it can judge the quality of a response and retrieval even when a human-written "perfect" answer isn't available. It achieves this by using a strong LLM (the Judge) to analyze the relationship between the Query, the Context, and the Answer.

### The RAG Triad (RAGAS Concepts Applied)
We have formalized our testing around the **RAG Triad**, a methodology popularized by the **RAGAS** community. In the Node.js/TypeScript ecosystem, **Promptfoo** serves as the professional equivalent to RAGAS, providing the orchestration and grading logic needed to evaluate these three pillars:

1.  **Context Relevance** (Applied): We ensure that retrieved documents are actually useful. We validate this using JSON schema checks (`is-json`) and strict path assertions.
2.  **Faithfulness** (Applied): Also known as *Groundedness*. We use `llm-rubric` with explicit scoring to ensure the generator never "invents" facts outside the provided context.
3.  **Answer Relevance** (Applied): We assess whether the response matches the user's initial intent and conversational needs without hallucinating unrelated topics.

### Tooling: Promptfoo as the Node.js RAGAS
While the official RAGAS library has more mature and feature-rich support in the Python ecosystem, this application was originally developed in Node.js to provide a fundamental codebase for practicing RAG evaluation. 

In this context, **Promptfoo** is more than just an acceptable alternative; it is the industry-leading option for Node.js workflows. It allows us to:
- **Orchestration**: Run test suites across different prompts and model configurations with minimal setup.
- **Scoring Logic**: Leverage "LLM-as-a-judge" to apply the same mathematical frameworks (Faithfulness, Relevance) defined by RAGAS.
- **Learning Focus**: Maintain a unified TypeScript environment that makes the core concepts of RAG evaluation accessible to developers who prefer the Node.js stack.

---

## 🏗 The 4-Tier Assertion Pyramid

We use a layered testing strategy to move from simple binary checks to complex semantic evaluations.

| Tier | Type | Purpose | Tooling |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Binary | Strict contract validation (JSON structure, keyword presence). | `is-json`, `icontains` |
| **Tier 2** | Semantic | Vector-based similarity for factual anchor points. | `similar` |
| **Tier 3** | Scored | LLM-as-a-Judge grading using weighted rubrics. | `llm-rubric` |
| **Tier 4** | Critical | Safety gates and out-of-scope refusals (Threshold: 1.0). | `llm-rubric` |

---

## 🔍 Layer 1: Retrieval Evaluation (The Context)

**Goal**: To verify that for any given user query, the system identifies the correct information source.

### Key Metrics
- **Context Precision**: Out of all the documents retrieved, how many are actually relevant?
- **Context Recall**: Did the system find the *specific* document that contains the ground-truth answer?

### Assertion Strategy
Use "Binary Probes" to identify a unique fact, number, or keyword that *only* exists in the target document.
```yaml
- description: "Query should retrieve specific diet-003 metadata"
  vars:
    request: "What should I eat for gout?"
  assert:
    - type: "icontains"
      value: "uric acid" # Unique string in the target document
```

---

## 🧠 Layer 2: Generation Evaluation (The Logic)

**Goal**: To verify the reasoning and safety of the final response.

### 1. Faithfulness (Anti-Hallucination)
This measures how "grounded" the answer is in the provided context. If the bot provides a correct answer that *isn't* in the retrieved documents, it has "hallucinated" (even if the fact is true in the real world). In a strict RAG system, this is a failure.

### 2. Answer Relevance
This measures how well the answer addresses the user's intent. A perfect answer to the wrong question is a failure.

### Assertion Strategy (LLM-as-a-Judge)
Use a strong model (e.g., `llama3.1:8b`) to score the response against a mathematical rubric. 

**Example Rubric Pattern**:
```yaml
- type: "llm-rubric"
  threshold: 0.8
  transform: "output.answer"
  value: |
    Score the response from 0.0 to 1.0 based on conversational quality:
    - Award 1.0 if the response is warm and acknowledges the query.
    - Deduct 0.4 if the response pivots to data without any acknowledgment.
    - Award 0.0 if the response is unsafe or incorrect.
```

---

## 🚀 Execution & Performance Benchmarking

### Model Determinism
To ensure 100% CI determinism, evaluations use pinned model weights (`llama3:8b`, `llama3.1:8b`, `mxbai-embed-large:335m`).

### Continuous Improvement
If a failure occurs:
1. **Retriever Failure?** Adjust chunking strategy, embeddings, or top-k parameters.
2. **Generator Failure?** Adjust system prompts, few-shot examples, or model temperature.

---

## 📚 References & Further Reading

For a deeper dive into the theories and frameworks that power this benchmark, we recommend the following reputable sources:

- **[RAGAS Concepts](https://docs.ragas.io/en/stable/concepts/metrics/index.html)**: The definitive guide to Faithfulness, Relevancy, and Context metrics.
- **[LangChain Evaluation Guide](https://python.langchain.com/docs/guides/evaluation/examples/rag)**: Best practices for implementing LLM-as-a-Judge.
- **[Promptfoo RAG Guide](https://www.promptfoo.dev/docs/guides/rag-evaluation/)**: Technical implementation of RAG benchmarks.
- **[TruLens - The RAG Triad](https://www.trulens.org/trulens_eval/core_concepts_rag_triad/)**: Deep dive into the three pillars of RAG evaluation.
- **[OpenAI - Evaluating RAG](https://github.com/openai/openai-cookbook/blob/main/examples/evaluation/How_to_eval_rag_pipelines.ipynb)**: Official cookbook for RAG assessment.
