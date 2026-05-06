# learning-agent

Agent-first pattern repo for **bounded teaching and progression**.

This repo demonstrates one reusable shape:

- a curriculum exists
- an agent picks the next useful concept
- the system produces a teaching artifact or recall prompt
- progression is tracked over time

The point is not the current curriculum. The point is the pattern.

Companion reading: [Three SDKs, three jobs](https://stoneytech.net/learn/2026-05-05-three-sdks-three-jobs) explains why this repo stays in the smallest-loop lane. [Three repos, one thesis](https://stoneytech.net/learn/2026-05-05-three-repos-one-thesis) shows how this repo joins the wider proof set.

## Purpose

Use this repo as a reference when an agent needs to:

- draft teaching content from a bounded curriculum
- advance through topics with explicit progression rules
- pair content generation with spaced repetition

Do not use this repo as a production learning platform. It is a pattern repo, not a full application.

## Pattern claim

**Pick the next teachable thing on purpose, then generate or reinforce it in a bounded loop.**

That shape is useful for:

- onboarding systems
- study companions
- concept drills
- progressive content generation

## Design contract

### Graph first

The control shape is:

```text
curriculum -> pick next concept -> draft or recall -> update ledger
```

This repo uses a small loop instead of a full graph runtime, but the flow is still named first so an agent can reuse it.

### MCP first

The bounded context surface is:

- the curriculum
- prerequisite state
- drill ledger
- study ledger

If this pattern is wrapped by an MCP later, that MCP should expose curriculum state and progression state, not an unbounded authoring environment.

### Template first

The reusable contracts are:

- the teaching-draft template
- the recall-question template
- the grading scale

Those templates are the portable teaching surface for agents and humans.

## Runtime shape

```text
curriculum
  -> picker
  -> draft or recall prompt
  -> ledger update
  -> next concept chosen from progression state
```

## When to use this pattern

Use this pattern when:

- progression matters more than one-off answers
- the system should know what has already been covered
- teaching and recall both matter
- a small loop is enough

Do not use this pattern when:

- the system first needs outside research
- the output must pass multi-lens acceptance checks
- the work spans many review stages or external tools

For those cases, pair it with `evidence-agent` or `gvar-engine`.

## Standalone scenario

Use `learning-agent` by itself for:

- a concept-of-the-day teaching loop
- a recall and reinforcement companion
- progressive curriculum generation

## Pair scenarios

### With `evidence-agent`

Use the pair when:

- a lesson needs a bounded evidence input first
- teaching content should be grounded before drafting

Flow:

```text
evidence-agent -> learning-agent
```

`evidence-agent` gathers a bounded brief. `learning-agent` turns that material into a teaching artifact.

### With `gvar-engine`

Use the pair when:

- a teaching artifact needs structured review before use or publication

Flow:

```text
learning-agent -> gvar-engine
```

`learning-agent` drafts. `gvar-engine` verifies whether the draft is acceptable yet.

## Trinity scenario

Use all three together when the job is:

- gather bounded evidence
- teach or explain from that material
- verify the result before acceptance

Flow:

```text
evidence-agent -> learning-agent -> gvar-engine
```

That is the full public proof set:

- `evidence-agent` researches
- `learning-agent` teaches
- `gvar-engine` verifies

## Status

**v0.1 — local-runnable.** Works end-to-end on this machine. Telegram delivery and production cron deploy are still deferred in the site backlog.

## Quick start

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY in .env

npm install
npm run hello
npm run list

# Content engine
npm run drill

# Learning engine
npm run study
npm run grade <slug> <0-5> [notes...]
```

By default, learning drafts go to `~/stoneytech-site/src/posts/learn/_drafts/` and study state lives in `curriculum/study-ledger.json`.

## What the example does

This repo contains two small loops over the same curriculum:

- `drill` — picks the next undrilled concept and generates a teaching draft
- `study` — picks the next due concept and sends a recall prompt with SM-2 scheduling

## How it picks

The picker (`src/picker.ts`):

1. filters concepts whose prerequisites are satisfied
2. filters out already-drilled concepts
3. prefers lower-tier foundation concepts first
4. prefers concepts closest to the main progression spine
5. rotates across recent levers so the cadence does not stall

Force a specific concept:

```bash
CONCEPT=rag-vs-lora npm run drill
```

Dry-run:

```bash
DRY_RUN=1 npm run drill
```

## SM-2 recall loop

The study side uses SM-2 spaced repetition:

- grades `0-2` reset the concept to near-term review
- grades `3-5` expand the interval
- state is kept per concept in `curriculum/study-ledger.json`

## Copy this shape into a real app

Keep:

- explicit curriculum state
- progression-aware picking
- separate generation and recall loops
- small, inspectable output steps

Replace:

- the curriculum
- the delivery channel
- the output format
- the persistence and scheduling backend

## Files

- `src/picker.ts` — progression-aware concept selection
- `src/prompt-template.ts` — teaching-draft prompt shape
- `curriculum/concepts.json` — concept catalog
- `curriculum/ledger.json` — drill history
- `curriculum/study-ledger.json` — recall state

## License

Private. StoneyTECH llc.
