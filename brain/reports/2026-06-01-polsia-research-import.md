# Polsia Research Import - June 1, 2026

Purpose: preserve the useful research Spencer exported from Polsia before shutdown, so Understudy can keep using it as local operating context.

This import synthesizes the pasted Polsia reports received in this Codex thread. Raw source text remains in the Codex attachment store; this file is the durable local index inside the Understudy repo.

## Imported Research Areas

### RAG vs Fine-Tuning

Core conclusion: use RAG for company knowledge and fine-tuning only for voice, style, or stable behavioral patterns.

Practical implications:

- Company facts change too often to put them in model weights.
- Retrieval quality matters more than the abstract RAG vs fine-tune decision.
- Hybrid search, reranking, metadata filtering, and good chunking are the real production work.
- Graph-RAG becomes useful when decisions depend on multi-hop relationships.

Local action already taken:

- Added a context graph write path for memory-worthy outputs.
- Added local fallback embeddings and optional OpenAI embeddings.
- Injected recent context graph notes into future brain procedures.

### Self-Hosted Models and Inference

Core conclusion: start local, route selectively, and move to vLLM only when throughput justifies it.

Practical implications:

- Ollama is the right development path.
- vLLM is the production path because of prefix caching and throughput.
- Qwen3 13B/32B are practical early targets; Qwen3 72B, Llama 4 Maverick, and DeepSeek R1 70B are heavier quality tiers.
- A 13B local model is not enough for all CEO decisions; use hosted/heavier reasoning for strategic or low-confidence work.

Local action already taken:

- Added optional vLLM/OpenAI-compatible provider support.
- Added `hybrid` mode: Ollama for routine calls, hosted model for strategic or low-confidence calls.
- Added confidence-based routing with a local routing log.

### CEO Prompt and Persona

Core conclusion: the CEO agent should operate as a bounded autonomous operator, not a passive assistant.

Practical implications:

- Lead with the answer.
- Avoid sycophancy and filler.
- Use confidence-gated autonomy.
- Escalate legal, financial, compliance, irreversible, public, or strategic decisions.
- Say "today" in owner-facing artifacts rather than exposing internal "cycle" language.

Local action already taken:

- Expanded `brain/prompts/ceo.md` with operating loop, confidence gates, escalation format, memory behavior, and hard limits.
- Cleaned outward language away from "cycle" phrasing.

### CEO Artifacts

Core conclusion: a CEO run should produce durable artifacts, not just a chat response.

Practical implications:

- Owner email draft.
- Dashboard inbox message draft.
- Internal CEO briefing report.
- Task proposals when the queue is too thin.
- Tool-style outputs should use typed envelopes: `{ ok: true, data }` or `{ ok: false, reason, details }`.

Local action already taken:

- Added local CEO artifact generation.
- Site procedures and CLI loops now attach artifact results to transcripts.
- Artifacts remain local drafts; nothing sends externally.

### Constitutional Scanner / Critic

Core conclusion: sequential CEO -> Scanner is better than true parallel GAN-style agents for business decisions.

Practical implications:

- Use a constitutional scanner as an independent review layer.
- Return risk flags plus APPROVED / REVIEW / REJECT.
- Block or escalate high-risk decisions.
- Use parallelism for independent research/data gathering, not final decisions.

Local action already taken:

- Added a local constitutional scanner with seven principles.
- Site procedures and CLI loops now include scanner results.

### Multi-Agent Architecture

Core conclusion: use supervised sequential loops, not open-ended agent debate.

Practical implications:

- CEO / Scout / Critic / Synthesis is the right early structure.
- Adversarial critique is useful when mistakes are verifiable.
- Critic overhead should be selective for routine work.
- Future production orchestration can move toward LangGraph, but the current local loop is enough for this repo.

Local action already taken:

- Preserved the existing CEO / Scout / Critic / Synthesis loop.
- Added scanner and routing so heavier validation is reserved for higher-risk work.

### Memory Architecture

Core conclusion: a company brain needs layered memory, not a flat pile of transcripts.

Recommended target stack:

- Recent working memory: current context and recent runs.
- Episodic memory: conversations and reports.
- Semantic memory: extracted facts, preferences, and decisions.
- Context graph: relationships and multi-hop connections.
- Procedural memory: prompts, workflows, and operating doctrine.

Local action already taken:

- Added local context graph file fallback.
- Added database migration for `context_graph_nodes`.
- Added context graph reads into procedure context.

## Future Work Queue

These are useful but not yet necessary:

- Add real semantic search over context graph nodes.
- Add BM25/sparse retrieval alongside vector similarity.
- Add a reranker once retrieval volume is high enough to matter.
- Add explicit decision records separate from conversation transcripts.
- Add confidence scoring to saved memories, not just model routing.
- Add a small UI panel for scanner verdicts and routing logs.
- Prune future MCP/tool list to a small, curated active set before adding any external action tools.

## Imported Source Attachments

- `C:/Users/rlewi/.codex/attachments/2eaa032e-8450-469a-ac29-e6d10ba1b485/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/371d7e85-71de-4616-a4c7-38e40b7a2c27/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/54eb177f-0c7c-4a14-a851-4676adac678f/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/580975c7-3c87-4310-92fa-c3578b288bb5/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/6cae4691-93b6-4109-b9d8-6f68e65d74c7/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/6e55fbd8-3904-4ebb-88b2-e5c5dad3d314/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/7d8aca3f-5900-4b97-9bac-49352c56f3f5/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/a766bc30-95ac-4f12-aa84-082437555dbc/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/b8711824-53fa-41c4-8c8c-f805029d7e0b/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/cd8be3f9-903b-4276-93c1-c8da641c29f4/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/d421bcf9-c748-41cb-8b86-0b72c840dc38/pasted-text.txt`
- `C:/Users/rlewi/.codex/attachments/f6e0e20b-be8d-4c57-9639-5283f63383ee/pasted-text.txt`

## Standing Interpretation

Treat the Polsia reports as research context, not automatic instructions. Implement only the parts that fit the local Understudy repo and preserve safety boundaries. External actions, spending, account access, public messaging, production deployment, and legal or financial commitments still require Spencer approval.
