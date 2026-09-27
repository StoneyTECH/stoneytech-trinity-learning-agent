import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath, not URL.pathname: pathname keeps percent-encoding, so a space in the path would stay "%20".
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
}

function loadText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

export function getRepoOverview() {
  return {
    repo: 'StoneyTECH-Trinity-Learning-Agent',
    pattern: 'bounded teaching and progression',
    mcp_mode: 'read-only'
  };
}

export function getPattern() {
  return loadText('PATTERN.md');
}

export function getAxiomsAddressed() {
  return loadText('AXIOMS.md');
}

export function getScenarios() {
  return loadText('SCENARIOS.md');
}

export function getGraph() {
  return {
    nodes: loadJson('graph/nodes.json'),
    edges: loadJson('graph/edges.json')
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Stub server for local BYO-agent use:
  // - replace with a real MCP SDK server when transport matters
  // - keep the tools read-only
  // - keep the file graph as the portable source of truth
  // - run this MCP through the StoneyTECH MCP compliance scanner before promotion
  console.log(JSON.stringify({ overview: getRepoOverview(), graph: getGraph() }, null, 2));
}
