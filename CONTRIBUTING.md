# Contributing

Thanks for helping improve this pattern repo.

## Ground rules

- Keep the repo agent-first and human-readable.
- Preserve the public pattern focus. Do not add private runtime assumptions or organization-specific secrets.
- Prefer portable defaults over machine-local paths.
- Keep the repo Graph first, MCP first, Template first.

## Development flow

1. Create or switch to a feature branch.
2. Make the smallest change that improves the pattern.
3. Run the local checks:
   - `npm run demo`
   - `npm run mcp:demo`
   - `npx tsc --noEmit`
4. Update the docs when the pattern contract changes.

## MCP changes

If you change the local MCP surface:

- keep it read-only
- keep the manifest accurate
- run the StoneyTECH MCP compliance scanner before treating the change as release-ready

## Upgrade seams

This repo intentionally leaves extension seams for:

- provider swaps
- shadow tribunals
- `n8n` orchestration
- larger graph or storage backends

Add clues, not hidden coupling.
