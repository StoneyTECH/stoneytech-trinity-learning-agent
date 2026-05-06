# File Graph DB

This repo ships a file-backed graph DB:

- `nodes.json`
- `edges.json`

Why:

- easy to clone
- easy for agents to inspect
- easy to diff
- easy for the repo-local MCP to expose

## Grow-up path

Start with files.

When the repo needs more:

1. SQLite or Postgres for larger local state
2. Neo4j or another graph-native backend if relationship traversal becomes central
3. hosted graph behind the same read-only MCP boundary if remote access matters

The rule stays the same:

**the MCP reads the doctrine boundary; the storage backend can change later**
