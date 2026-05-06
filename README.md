# learning-agent

Two daily agents over a shared curriculum on the agentic stack. Same 20-concept catalog feeds both:

- **`drill`** — content engine. Picks the next undrilled concept, generates a 1300-word multi-level `.svx` draft in Stoney's voice, commits to `output/drafts/`. Removes the blank page on the weekly publishing cadence.
- **`study`** — learning engine. Picks the next concept due for spaced repetition, sends a recall question + canonical answer via Telegram, records an open attempt. Self-graded via `npm run grade <slug> <0-5>`; SM-2 schedules the next review.

Both run on the **Anthropic TypeScript SDK** with single-call agent patterns. Phase 1 of the three-SDK comparison build (Learning / Watcher / JobR / Meta); sister agents in the comparison will run on LangGraph and the OpenAI Agents SDK; the meta-article compares the three.

Companion reading: [Three SDKs, three jobs](https://stoneytech.net/learn/2026-05-05-three-sdks-three-jobs) explains why this repo stays in the smallest-loop lane and where the OpenAI Agents SDK or LangGraph become a better fit.

## Status

**v0.1 — local-runnable.** Works end-to-end on your machine. Telegram delivery and production cron deploy are deferred (GVAR-16 / GVAR-17 in the stoneytech-site backlog).

## Quick start

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY in .env

npm install
npm run hello                          # Verify SDK + API key (calls Opus 4.7 once)
npm run list                           # See the curriculum + drill status

# Content engine
npm run drill                          # Pick next undrilled, generate .svx draft

# Learning engine
npm run study                          # Pick next due, send Telegram recall Q+A
npm run grade <slug> <0-5> [notes...]  # Grade your recall, schedule next review
```

By default, learning drafts go to `~/stoneytech-site/src/posts/learn/_drafts/` (override with `DRAFTS_DIR=`). Study state lives in `curriculum/study-ledger.json` (override with `STUDY_LEDGER=`).

## How it picks

The picker (`src/picker.ts`):
1. Filters concepts whose prerequisites have all been drilled (or are empty).
2. Filters out already-drilled concepts.
3. Prefers tier 1 (must-own) over tier 2 (must-recognize) over tier 3 (vocabulary).
4. Within a tier, prefers concepts with the fewest prerequisites — closest to the determinism-ladder spine.
5. Tiebreaks by lever recency: prefer the lever that hasn't been touched in the last five drills (so the cadence rotates rather than stalling on one layer).

Force a specific concept: `CONCEPT=rag-vs-lora npm run drill`.

Dry-run (no draft written, no ledger appended, prints to stdout): `DRY_RUN=1 npm run drill`.

## How it generates

The prompt template (`src/prompt-template.ts`) instructs Opus 4.7 to produce a multi-level teaching draft following the `.svx` frontmatter conventions of stoneytech-site. Eight-section structure: opening scar / metaphor / definition / formal frame / trade-offs / war story / prototype assignment / spirit. Voice rules pinned in the system prompt. Output is a complete `.svx` file ready for review.

Drafts ship with `verification.status: pending-panel` — they need to clear the GVAR v3.3 6-verifier panel via the stoneytech-site webhook before the banner turns green.

## Curriculum

`curriculum/concepts.json` — 20 concepts at v0.1, expanding toward 50 as the practice runs. Each concept has `slug`, `title`, `tier`, `lever`, `prerequisites`, `tags`, `war_story_hint`, `anchor_axiom`.

`curriculum/ledger.json` — append-only record of drills. The picker reads this to skip already-drilled concepts.

To add a new concept: edit `concepts.json`, push, the next `npm run drill` will see it.

## SM-2 spaced repetition (the study engine)

Uses [SuperMemo SM-2](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2). Quality grades 0-5:

- **5** instant + complete recall
- **4** recall with hesitation
- **3** recall with significant effort (would have failed without hint)
- **2** wrong, but the right answer felt familiar
- **1** wrong, the right answer felt new
- **0** total blank

Below 3 → repetitions reset, interval to 1 day. ≥3 → interval grows: 1d → 6d → previous × ease. Ease factor adjusts on every review with floor 1.3.

State per concept lives in `curriculum/study-ledger.json` and is committed back to main on each daily run.

## CI

Two GitHub Actions workflows:

- **Daily Drill** — 12:00 UTC (7am CDT). Generates the next essay draft, commits to `output/drafts/`, pushes Telegram digest with the GitHub link.
- **Daily Study** — 13:00 UTC (8am CDT, an hour after the drill). Generates the next study Q+A, sends Telegram, logs an open attempt.

Manual triggers via `gh workflow run` or the GitHub Actions UI; both accept an optional `concept` slug input.

## Roadmap

- **v0.1** ✓ Local-runnable drill.
- **v0.2** ✓ Drill on cron + Telegram digest via the Nemotron bridge.
- **v0.3** ✓ Study agent + SM-2 + grade CLI + daily-study cron.
- **v0.4** (GVAR-16.5) — Auto-PR drill drafts to stoneytech-site. Removes the manual copy step. Needs a fine-grained PAT for cross-repo writes.
- **v0.5** (inbound Telegram) — Auto-grading: study sends Q, you reply via Telegram, n8n webhook captures the reply, an LLM judges against canonical, posts grade back. Removes the CLI grade step.
- **v0.6** (GVAR-29) — Sibling watcher agent: polls AI-influencer feeds, produces a daily intelligence digest, same Telegram bridge.

## License

Private. StoneyTECH llc.
