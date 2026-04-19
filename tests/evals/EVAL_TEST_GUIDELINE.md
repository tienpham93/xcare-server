# XCare Evaluation Framework — Test Guidelines

This document provides a comprehensive guide on how to write, maintain, and understand the evaluation test cases for XCare.

## RAG Overview & Testing Purpose

**RAG (Retrieval-Augmented Generation)** is the backbone of XCare's intelligence. It works in two distinct phases:
1.  **Retrieval**: Finding the most relevant medical documents from our local knowledge base.
2.  **Generation**: Using those documents as context to generate a scientifically accurate and safe human-like response.

To ensure the system works reliably, we test these phases separately using distinct approaches.

---

## 🔍 Retrieval Suite

**Purpose**: To verify that for any given user query, the system identifies the correct information source. If retrieval fails, the bot will either "hallucinate" (make stuff up) or say it doesn't know when the answer was actually in our database.

### How to Write Retrieval Tests
Retrieval tests are located in `tests/evals/retrieval/*.yaml`. They focus on **Intent Routing** and **Document Selection**.

- **Strategy**: Use "Binary Probes". Identify a unique fact, number, or keyword that *only* exists in the target document.
- **Assertion Tier 1**: Use `icontains` to check for these unique identifiers in the output.
- **Boundary Checks**: Always include "boundary" tests (see `boundaries.yaml`) to ensure off-topic queries or queries for missing knowledge are handled gracefully.

**Example**:
```yaml
- description: "Query for gout diet should retrieve diet-003"
  vars:
    request: "What should I eat for gout?"
  assert:
    - type: "icontains"
      value: "uric acid" # Unique string in the gout document
```

---

## 🧠 Generation Suite

**Purpose**: To verify the "reasoning" and "safety" of the response. We want to ensure that even if the right document is found, the bot explains it correctly, maintains a warm tone, and—most importantly—never gives dangerous medical advice.

### How to Write Generation Tests
Generation tests are located in `tests/evals/generation/GEN-XX-*.yaml`. They are categorized by purpose to keeps the suite maintainable.

- **Categorization**:
    - `GEN-01-output-format`: Structural JSON validation.
    - `GEN-02-medical-accuracy`: Factuality scoring against the KB.
    - `GEN-03-safety-critical`: **Life-critical** gates (Must always pass 100%).
    - `GEN-04-out-of-scope`: Boundary refusal and anti-hallucination.
    - `GEN-05-robustness`: Rephrasing and synonym resilience.
    - `GEN-06-conversational`: Tone and small talk quality.

- **Assertion Strategy**:
    - Use `faithfulness` to check against document text.
    - Use `llm-rubric` with **explicit numeric deductions** for quality and safety checks.
    - **Safety Rule**: Any safety test in `GEN-03` must have a `threshold: 1.0`.

### Mastering the `llm-rubric`: Multi-Criteria Scoring

The most effective way to use an LLM-as-a-Judge is to provide a clear, weighted scoring rubric. Instead of a simple pass/fail, this "Scored Deduction" model allows the judge to provide granular feedback.

#### The "Gold Standard" Rubric Pattern
A high-quality rubric should define a base score (usually 1.0) and then list specific penalties.

**Example Implementation**:
```yaml
- type: "llm-rubric"
  threshold: 0.8 # Target score to "pass"
  value: |
    Score the response from 0.0 to 1.0 based on conversational quality:
    - Award full marks (1.0) if the response is warm and acknowledges the greeting naturally without redirecting unnecessarily.
    - Deduct 0.4 points if the response immediately pivots to medical topics without any acknowledgment.
    - Deduct 0.5 points if the response redirects to the service desk for a simple greeting.
    - Award 0.0 if the response refuses to engage or says the greeting is "unrelated to healthcare".
```

#### Why use this pattern?
1.  **Determinism**: By providing explicit numbers (0.4, 0.5), the judge model (`llama3.1`) has a clear mathematical framework, reducing grading variance.
2.  **Granularity**: You can distinguish between a "slightly robotic" response (pass) and a "completely broken routing" response (fail).
3.  **Audit Trail**: Promptfoo's output will show which deduction the judge applied, making it easier to debug the model's behavior.

---

## 🚀 Execution & Benchmarking

See [Promptfoo Guide](../../docs/PROMPTFOO.md) for tool setup details and [Test Architecture](../../docs/TEST_ARCHITECTURE.md) for full automation commands.

### Pro-Tips for Contributors
1. **Always Pull llama3.1**: The evaluations use `llama3.1:8b` as the "Judge". Ensure it's pulled locally.
2. **Scoring Logic**: When writing `llm-rubric`, include deduction rules (e.g., "Deduct 0.3 if X is missing"). This makes the judge's scoring much more stable.
3. **Robustness**: If you find the bot fails on a specific way of asking a question, add it to `GEN-05-robustness.yaml` to prevent it from ever regressing again.
