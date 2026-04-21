# Promptfoo Integration Guide

[Promptfoo](https://www.promptfoo.dev/) is an open-source CLI tool and library for evaluating LLM output quality. It allows you to run test cases against your prompts and models, providing a systematic way to measure performance and prevent regressions.

## Overview

In XCare, Promptfoo is used as the core engine for our **Internal Benchmark**. It orchestrates the execution of dozens of test cases, comparing the output of our `llama3:8b` model against ground truth data stored in our knowledge base.

## Installation

Promptfoo is included as a dev dependency via `bun`. You don't need to install it globally.

```bash
# Verify installation
bunx promptfoo --version
```

## Setup & Configuration

The main configuration file is `promptfooconfig.yaml` in the project root.

```yaml
# promptfooconfig.yaml
description: "XCare RAG Evaluation Suite"

providers:
  - id: "file://tests/evals/providers/xcare_provider.ts"
    label: "XCare-Bot"
    options:
      url: "http://localhost:5002/agent/generate"

defaultTest:
  options:
    provider:
      id: "ollama:chat:llama3.1:8b" # The judge model
      options:
        baseUrl: "http://localhost:11434"

prompts:
  - "{{request}}" # Pass the user request through our provider

tests:
  - "tests/evals/retrieval/*.yaml"
  - "tests/evals/generation/*.yaml"
```

## Assertion Types

XCare uses a variety of assertion types provided by Promptfoo to validate different aspects of the response:

### 1. Deterministic Assertions (Binary)
Used for retrieval grounding and boundary checks.
- `icontains`: Checks if the output contains a specific substring.
- `not-icontains`: Checks if the output does NOT contain a specific substring.
- `is-json`: Validates the entire output object against a centralized JSON schema.
- `javascript`: Executes custom JS logic to validate complex conditions (e.g., specific field types).

### 2. Semantic Assertions (Similarity)
Used for pricing and factual consistency.
- `similar`: Uses an embedding model (`mxbai-embed-large:335m`) to calculate the cosine similarity between the output and the expected value. We typically use a threshold of `0.80`.

### 3. Model-Graded Assertions (Judgement)
Used for complex accuracy and safety grading. These require a "Judge" model (`llama3.1:8b`).
- `faithfulness`: Checks if the response is factually consistent with a provided piece of context (ground truth).
- `answer-relevance`: Checks if the response actually addresses the user's question without side-tracking.
- `llm-rubric`: Evaluates the output against a text-based rubric. Supports scoring logic (e.g., "Award 1.0 if...", "Deduct 0.5 if...").

## Running Evaluations

Refer to the primary [Test Architecture](file:///Users/tienpham/Documents/xcare-server/docs/TEST_ARCHITECTURE.md) for full commands, but generally:

```bash
# Run all evaluations
bun run test:eval:full

# View the results in the Promptfoo web UI
bun run test:eval:view
```
