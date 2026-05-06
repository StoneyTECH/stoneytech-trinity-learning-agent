# StoneyTECH-Trinity-Learning-Agent

Agent-first pattern repo for **bounded teaching and progression**.

This repo demonstrates one reusable shape:

- a curriculum exists
- an agent picks the next useful concept
- the system produces a teaching artifact or recall prompt
- progression is tracked over time

The point is not the current curriculum. The point is the pattern.

Companion reading: [Three SDKs, three jobs](https://stoneytech.net/learn/2026-05-05-three-sdks-three-jobs) explains why this repo stays in the smallest-loop lane. [Three repos, one thesis](https://stoneytech.net/learn/2026-05-05-three-repos-one-thesis) shows how this repo joins the wider proof set.

## Family

This repo is one member of the StoneyTECH Trinity pattern set:

- `StoneyTECH-Trinity-Learning-Agent`
- `StoneyTECH-Trinity-Evidence-Agent`
- `StoneyTECH-Trinity-GVAR-Engine`

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

## Axioms addressed

- [Axiom #1 — the smallest lever wins](https://stoneytech.net/axioms#smallest-lever-wins): this repo keeps the loop intentionally small.
- [Axiom #2 — push work down toward determinism](https://stoneytech.net/axioms#push-toward-determinism): the curriculum and ledger do the steering work instead of free-form guesswork.
- [Axiom #16 — do not curate without proving](https://stoneytech.net/axioms#dont-curate-without-proving): concepts are exercised through runnable drills and recall loops.

See [AXIOMS.md](./AXIOMS.md) for the local doctrine map.

## Related MCPs

- StoneyTECH public content MCP: [https://public-content-mcp.stoneytech.net/mcp](https://public-content-mcp.stoneytech.net/mcp)
- local repo MCP stub: [mcp/manifest.json](./mcp/manifest.json)

The shared StoneyTECH MCP gives family doctrine. This repo-local MCP exposes curriculum and progression truth.

Before promoting the local MCP beyond development, run it through the StoneyTECH MCP compliance scanner and keep the scan result with the release notes or repo receipts.

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

For those cases, pair it with `StoneyTECH-Trinity-Evidence-Agent` or `StoneyTECH-Trinity-GVAR-Engine`.

## Bring your own model

This repo starts with a direct Anthropic path, but it should grow with the reader.

Upgrade later to:

- local agents
- direct vendor keys across providers
- OpenRouter routing
- graph-mapped role selection
- shadow tribunals for draft or study quality
- `n8n` scheduling and webhook delivery

The upgrade seams live in:

- [agents/graph-map.json](./agents/graph-map.json)
- [providers/provider-map.example.json](./providers/provider-map.example.json)
- [shadow/tribunal-config.example.json](./shadow/tribunal-config.example.json)
- [integrations/n8n/workflow-stub.jsonc](./integrations/n8n/workflow-stub.jsonc)
- [graph/README.md](./graph/README.md)

## Standalone scenario

Use `StoneyTECH-Trinity-Learning-Agent` by itself for:

- a concept-of-the-day teaching loop
- a recall and reinforcement companion
- progressive curriculum generation

## Pair scenarios

### With `StoneyTECH-Trinity-Evidence-Agent`

Use the pair when:

- a lesson needs a bounded evidence input first
- teaching content should be grounded before drafting

Flow:

```text
StoneyTECH-Trinity-Evidence-Agent -> StoneyTECH-Trinity-Learning-Agent
```

`StoneyTECH-Trinity-Evidence-Agent` gathers a bounded brief. `StoneyTECH-Trinity-Learning-Agent` turns that material into a teaching artifact.

### With `StoneyTECH-Trinity-GVAR-Engine`

Use the pair when:

- a teaching artifact needs structured review before use or publication

Flow:

```text
StoneyTECH-Trinity-Learning-Agent -> StoneyTECH-Trinity-GVAR-Engine
```

`StoneyTECH-Trinity-Learning-Agent` drafts. `StoneyTECH-Trinity-GVAR-Engine` verifies whether the draft is acceptable yet.

## Trinity scenario

Use all three together when the job is:

- gather bounded evidence
- teach or explain from that material
- verify the result before acceptance

Flow:

```text
StoneyTECH-Trinity-Evidence-Agent -> StoneyTECH-Trinity-Learning-Agent -> StoneyTECH-Trinity-GVAR-Engine
```

That is the full public proof set:

- `StoneyTECH-Trinity-Evidence-Agent` researches
- `StoneyTECH-Trinity-Learning-Agent` teaches
- `StoneyTECH-Trinity-GVAR-Engine` verifies

## Status

**v0.1 — portable and local-runnable.** The core loop runs locally, optional bridge delivery is env-driven, and larger schedulers or cron surfaces remain upgrade seams rather than baked assumptions.

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

By default, generated drafts go to `./output/drafts/architect/` or `./output/drafts/primer/`, and study state lives in `curriculum/study-ledger.json`.

## Demo paths

Standalone demo, no model key required:

```bash
npm run demo
```

Write a draft or gold teaching artifact from a bounded evidence brief:

```bash
npm run demo -- --mode draft --output ./demo/draft.md
npm run demo -- --mode gold --output ./demo/gold.md
```

Local MCP demo:

```bash
npm run mcp:demo
```

Pair and Trinity demos live in `StoneyTECH-Trinity-GVAR-Engine` so the chain can finish at verification:

```bash
cd ../stoneytech-trinity-gvar-engine
python -m gvar_engine.trinity_demo --scenario evidence-learning
python -m gvar_engine.trinity_demo --scenario trinity
```

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

## Local graph and MCP

This repo ships a file-backed graph DB and a read-only MCP stub:

- [graph/nodes.json](./graph/nodes.json)
- [graph/edges.json](./graph/edges.json)
- [mcp/server.ts](./mcp/server.ts)

The graph starts as files on purpose. If the repo grows up:

- move to SQLite or Postgres for larger local state
- move to a graph-native backend when relationships become the main query surface
- keep the MCP boundary read-only even after the storage backend changes

## Files

- `src/picker.ts` — progression-aware concept selection
- `src/prompt-template.ts` — teaching-draft prompt shape
- `curriculum/concepts.json` — concept catalog
- `curriculum/ledger.json` — drill history
- `curriculum/study-ledger.json` — recall state
- `PATTERN.md` — the reusable pattern in one page
- `SCENARIOS.md` — standalone, pair, and trinity scenarios
- `AXIOMS.md` — local map to immutable StoneyTECH axioms
- `graph/` — file-backed graph DB plus upgrade notes
- `mcp/` — repo-local read-only MCP stub and manifest
- `providers/` — BYO-provider upgrade map
- `shadow/` — shadow-tribunal starter config
- `integrations/n8n/` — workflow stub and handoff seams

## License

Apache-2.0
