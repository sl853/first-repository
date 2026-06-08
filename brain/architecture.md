# Understudy Brain Architecture

## Important Clarification

The desired system is GAN-inspired, not literally a GAN.

A GAN is a training architecture where two models compete during training. That is not the best practical structure for an operating company brain right now.

The useful version for Understudy is a multi-role dialogue loop:

1. CEO: holds the company posture and makes recommendations.
2. Scout: searches for new angles, outside knowledge, weak signals, and better options.
3. Critic: challenges the recommendation, checks risk, and prevents hype drift.
4. Synthesis: records what changed, what was learned, and what the next action is.

This gives Spencer the feeling and benefit of a back-and-forth mind without pretending the system is training a new foundation model every day.

## Scrolling State

The brain should maintain a growing state log.

The state log is not just a transcript. It is the evolving company mind:

- live questions
- beliefs
- doubts
- decisions
- open loops
- research leads
- repeated instincts
- discarded paths
- approvals needed

## Learning Loop

The first version learns by accumulating structured memory and research, not by changing model weights.

Learning layers:

1. Context learning: better prompts and better source-of-truth files.
2. Memory learning: persistent notes, decisions, tasks, and daily briefs.
3. Retrieval learning: later, search over prior memory and reports.
4. Behavior learning: recurring critic feedback changes the CEO prompt and operating rules.
5. Model learning: fine-tuning or self-hosted model training only after enough high-quality internal data exists.

## Daily Research Mind

The Scout should constantly ask:

- What new technical option changes our path?
- What is cheaper now?
- What is newly possible locally?
- What did we assume that may be wrong?
- What is the simplest working version this week?
- What would make Understudy more independent?

## Practical First Version

The first working system should:

- keep a scrolling state log
- let Spencer ask questions
- produce CEO / Scout / Critic / Synthesis responses
- record decisions
- create tasks from synthesis
- identify what requires approval

Tool access comes later.
