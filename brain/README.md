# Understudy Brain

This folder is the first local version of the Understudy company brain.

It is not trying to be a fully autonomous CEO yet. The first useful version is a calm operating memory with:

- a company brief
- role prompts for the CEO, critic, researcher, and operator
- persistent memory
- task tracking
- daily brief generation
- clear approval boundaries

## Run Locally

From the project root:

```bash
npm run brain
```

Useful commands:

```bash
npm run brain -- brief
npm run brain -- tasks
npm run brain -- remember "Understudy should stay outside the VC-backed idea machine."
npm run brain -- add-task "Write the first owner operating doctrine" --owner ceo --risk low
npm run brain -- daily
npm run brain -- ask "What should Understudy build first?"
npm run brain -- loop "How should the AI CEO keep learning?"
```

## Philosophy

Understudy is not trying to become a louder company. It is trying to become easier to trust.

The brain should preserve the company taste:

- quality over velocity
- durable businesses over pitchable ideas
- merchant intelligence over investor readability
- modest but real scalability
- permission before high-impact action

## Next Milestones

1. Keep the website stable and host it later this week.
2. Use this folder as the operating source of truth.
3. Add an actual model interface after the memory/task loop is useful.
4. Add approval gates before the brain can touch email, money, domains, repos, or deployments.

## Model Access

The first model interface uses the existing `openai` package in this repo.

Set `OPENAI_API_KEY` locally, then run:

```bash
npm run brain -- ask "What should the AI CEO do next?"
```

Without `OPENAI_API_KEY`, the CLI prints the context it would send and gives a local fallback recommendation instead of failing.

## Dialogue Loop

The brain is GAN-inspired, not literally a GAN. The practical loop is:

1. CEO: recommendation
2. Scout: new angles and research paths
3. Critic: risk and approval review
4. Synthesis: state update and next action

Run:

```bash
npm run brain -- loop "What should the company brain learn next?"
```

The loop appends to `brain/state/scrolling-state.md`.

## CEO Artifacts

Every site-triggered CEO procedure, and every CLI `loop`, now writes a local four-artifact bundle:

- owner email draft in `brain/artifacts/`
- dashboard inbox message draft in `brain/artifacts/`
- `Day N Summary` report in `brain/reports/`
- task proposals when the open queue has fewer than three tasks

These are local drafts and records. They do not send email or post externally.

## Constitutional Scanner

CEO procedure transcripts also include a constitutional scanner result. The scanner checks recommendations against seven local principles:

- approval boundaries
- legal/compliance risk
- data/security exposure
- irreversible actions
- strategy drift
- trust/quality risk
- confidence gaps

It returns `APPROVED`, `REVIEW`, or `REJECT` with typed risk flags. This is a local review layer, not an external action.

## Model Routing

Hybrid model mode uses confidence-based routing:

- routine, high-confidence calls stay on Ollama
- strategic or confidence `< 0.75` calls route to the hosted model when `OPENAI_API_KEY` is set
- routing decisions are logged at `brain/state/routing-decisions.json`

This keeps expensive model use reserved for the decisions that actually need it.

## Context Graph

Memory-worthy outputs now write through to a context graph.

- With `DATABASE_URL`, migrations create a `context_graph_nodes` table.
- Without `DATABASE_URL`, nodes are saved locally at `brain/state/context-graph.json`.
- With `OPENAI_API_KEY`, embeddings use `text-embedding-3-small` by default.
- Without `OPENAI_API_KEY`, the brain uses a deterministic local hash embedding so local development still works.
