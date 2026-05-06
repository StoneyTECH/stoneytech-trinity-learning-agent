import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

function loadJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
}

export function getRepoOverview() {
  return {
    repo: 'StoneyTECH-Trinity-Learning-Agent',
    pattern: 'bounded teaching and progression',
    mcp_mode: 'read-only'
  };
}

export function getGraph() {
  return {
    nodes: loadJson('graph/nodes.json'),
    edges: loadJson('graph/edges.json')
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Stub server for local BYO-agent use:
  // - replace with a real MCP SDK server when transport matters
  // - keep the tools read-only
  // - keep the file graph as the portable source of truth
  console.log(JSON.stringify({ overview: getRepoOverview(), graph: getGraph() }, null, 2));
}
