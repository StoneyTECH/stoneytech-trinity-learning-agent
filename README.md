# drill-agent

Daily concept-of-the-day teaching agent for [stoneytech.net](https://stoneytech.net). Picks one undrilled concept from a curated curriculum, generates a multi-level `.svx` draft in Stoney's voice via Claude Opus 4.7, drops it in `stoneytech-site/src/posts/learn/_drafts/`, and appends to a local ledger.

Phase 1 of the three-SDK comparison build (Drill / Watcher / JobR / Meta) — this one runs on the **Anthropic TypeScript SDK** with a single-call agent pattern. Sister agents in the same comparison will run on LangGraph and the OpenAI Agents SDK; the meta-article compares the three.

## Status

**v0.1 — local-runnable.** Works end-to-end on your machine. Telegram delivery and production cron deploy are deferred (GVAR-16 / GVAR-17 in the stoneytech-site backlog).

## Quick start

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY in .env

npm install
npm run hello      # Verify SDK + API key (calls Opus 4.7 once, no draft written)
npm run list       # See the curriculum + which concepts have been drilled
npm run drill      # Pick the next concept and generate a draft
```

By default, drafts go to `~/JobSearch/stoneytech-site/src/posts/learn/_drafts/`. Override with `DRAFTS_DIR=/some/other/path npm run drill`.

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

## Roadmap

- **v0.1** (this) — local-runnable end-to-end.
- **v0.2** (GVAR-16) — Telegram digest after generating the draft. Posts concept name + why it matters + link to draft + link to PR.
- **v0.3** (GVAR-17) — daily 7am CT cron. Modal Labs or fly.io. Production-grade with retry on transient failure.
- **v0.4** (GVAR-29) — sibling watcher agent that polls AI-influencer feeds and produces a daily intelligence digest, posts to the same Telegram bridge.

## License

Private. StoneyTECH llc.
