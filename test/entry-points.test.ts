// Offline smoke tests for the other package.json entry points. drill and study run only in their
// documented no-API dry-run modes, as child processes (see runScript in helpers.ts: no API key,
// no bridge, fetch disabled). Their model-calling paths are deliberately not tested.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { getAxiomsAddressed, getGraph, getPattern, getRepoOverview, getScenarios } from '../mcp/server.ts';
import { loadCurriculum, pickNextConcept } from '../src/picker.ts';
import { buildPrimerUserPrompt } from '../src/prompt-template-primer.ts';
import { buildUserPrompt } from '../src/prompt-template.ts';
import type { StudyLedgerFile } from '../src/study-ledger.ts';
import {
  conceptMatchesRegister,
  type Concept,
  type LedgerEntry,
  type LedgerFile,
  type RegisterFilter
} from '../src/types.ts';
import { REPO_ROOT, guardRealData, readJson, runScript, sandbox, utcToday, writeJson } from './helpers.ts';

after(guardRealData());

const curriculum = loadCurriculum(join(REPO_ROOT, 'curriculum/concepts.json'));

function drillLedger(register: RegisterFilter, slugs: string[] = []): LedgerFile {
  return {
    schema: 'learning-agent-ledger/v2',
    description: 'fixture',
    drills: slugs.map((slug) => ({ slug, register, drilled_at: '2026-05-01', draft_path: '-', status: 'draft' }))
  };
}

/** Run a script, returning the run plus every UTC date it could have seen as "today". */
function runDated(script: string, dir: string, env: Record<string, string>) {
  const dates = [utcToday()];
  const run = runScript(script, [], dir, env);
  dates.push(utcToday());
  return { run, dates };
}

describe('drill with DRY_RUN=1 SKIP_API=1', () => {
  const DRY = { DRY_RUN: '1', SKIP_API: '1' };

  it('picks from DRILL_LEDGER and previews the architect prompt, writing nothing', (t) => {
    const dir = sandbox(t);
    // Mark the empty-ledger pick as drilled, so the expected pick proves DRILL_LEDGER was read.
    const first = pickNextConcept(curriculum, drillLedger('architect'), 'architect') as Concept;
    const ledger = drillLedger('architect', [first.slug]);
    writeJson(join(dir, 'ledger.json'), ledger);
    const expected = pickNextConcept(curriculum, ledger, 'architect') as Concept;

    const { run, dates } = runDated('src/drill.ts', dir, DRY);

    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`[picked] Drilling concept: ${expected.slug} — ${expected.title}`), run.stdout);
    assert.ok(run.stdout.includes('register: architect'));
    assert.ok(dates.some((d) => run.stdout.includes(buildUserPrompt(expected, d))), 'architect prompt preview');
    assert.deepEqual(readJson(join(dir, 'ledger.json')), ledger);
    assert.equal(existsSync(join(dir, 'drafts')), false);
  });

  it('REGISTER=primer picks for the primer register and previews the primer prompt', (t) => {
    const dir = sandbox(t);
    writeJson(join(dir, 'ledger.json'), drillLedger('primer'));
    const expected = pickNextConcept(curriculum, drillLedger('primer'), 'primer') as Concept;

    const { run, dates } = runDated('src/drill.ts', dir, { ...DRY, REGISTER: 'primer' });

    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`[picked] Drilling concept: ${expected.slug}`), run.stdout);
    assert.ok(run.stdout.includes('register: primer'));
    assert.ok(dates.some((d) => run.stdout.includes(buildPrimerUserPrompt(expected, d))), 'primer prompt preview');
  });

  it('exits 0 with a message once every concept in the register has been drilled', (t) => {
    // The daily workflow relies on this: an exhausted curriculum is not a failed run.
    const dir = sandbox(t);
    const all = curriculum.concepts.filter((c) => conceptMatchesRegister(c, 'architect')).map((c) => c.slug);
    writeJson(join(dir, 'ledger.json'), drillLedger('architect', all));

    const run = runScript('src/drill.ts', [], dir, DRY);

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /No undrilled concepts remain for register='architect'/);
  });

  it('CONCEPT forces a concept, but only one that exists and matches the register', (t) => {
    const dir = sandbox(t);
    writeJson(join(dir, 'ledger.json'), drillLedger('architect'));
    const architectOnly = curriculum.concepts.find((c) => (c.register ?? 'architect') === 'architect') as Concept;
    const primerOnly = curriculum.concepts.find((c) => c.register === 'primer') as Concept;

    const forced = runScript('src/drill.ts', [], dir, { ...DRY, CONCEPT: architectOnly.slug });
    assert.equal(forced.status, 0, forced.stderr);
    assert.ok(forced.stdout.includes(`[forced] Drilling concept: ${architectOnly.slug} (register: architect)`));

    const mismatch = runScript('src/drill.ts', [], dir, { ...DRY, CONCEPT: primerOnly.slug });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /doesn't match REGISTER='architect'/);

    const unknown = runScript('src/drill.ts', [], dir, { ...DRY, CONCEPT: 'no-such-concept' });
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Concept slug not found: no-such-concept/);
  });

  it('refuses to start without OPENROUTER_API_KEY unless both DRY_RUN and SKIP_API are set', (t) => {
    const dir = sandbox(t);
    writeJson(join(dir, 'ledger.json'), drillLedger('architect'));
    for (const env of [{}, { DRY_RUN: '1' }]) {
      const run = runScript('src/drill.ts', [], dir, env);
      assert.equal(run.status, 1, JSON.stringify(env));
      assert.match(run.stderr, /OPENROUTER_API_KEY not set/);
    }
  });
});

describe('study with DRY_RUN=1', () => {
  it('picks from STUDY_LEDGER, finishing an open attempt first, and writes nothing', (t) => {
    const dir = sandbox(t);
    const last = curriculum.concepts[curriculum.concepts.length - 1];
    const ledger: StudyLedgerFile = {
      schema: 'learning-agent-study-ledger/v1',
      description: 'fixture',
      entries: [
        {
          slug: last.slug,
          ease_factor: 2.5,
          interval: 0,
          repetitions: 0,
          attempts: [{ attempted_at: '2026-05-01', question: 'q', canonical_answer: 'a' }]
        }
      ]
    };
    const path = join(dir, 'study-ledger.json');
    writeJson(path, ledger);
    const before = readFileSync(path, 'utf8');

    const run = runScript('src/study.ts', [], dir, { DRY_RUN: '1' });

    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`[picked] Studying: ${last.slug} — ${last.title}`), run.stdout);
    assert.ok(run.stdout.includes('[dry-run] Would record open attempt in study-ledger.'));
    assert.equal(readFileSync(path, 'utf8'), before);
  });

  it('starts from scratch when STUDY_LEDGER does not exist, without creating it', (t) => {
    const dir = sandbox(t);
    const first = curriculum.concepts[0];

    const run = runScript('src/study.ts', [], dir, { DRY_RUN: '1' });

    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`[picked] Studying: ${first.slug}`), run.stdout);
    assert.ok(run.stdout.includes('never studied'));
    assert.equal(existsSync(join(dir, 'study-ledger.json')), false);
  });

  it('CONCEPT forces a concept, which must exist', (t) => {
    const dir = sandbox(t);
    const target = curriculum.concepts[1];

    const forced = runScript('src/study.ts', [], dir, { DRY_RUN: '1', CONCEPT: target.slug });
    assert.equal(forced.status, 0, forced.stderr);
    assert.ok(forced.stdout.includes(`[picked] Studying: ${target.slug}`));

    const unknown = runScript('src/study.ts', [], dir, { DRY_RUN: '1', CONCEPT: 'no-such-concept' });
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Concept slug not found: no-such-concept/);
  });

  it('refuses to start without OPENROUTER_API_KEY outside DRY_RUN', (t) => {
    const run = runScript('src/study.ts', [], sandbox(t));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /OPENROUTER_API_KEY not set/);
  });
});

describe('list', () => {
  it('counts each drilled concept once, and a rejected drill not at all', (t) => {
    const dir = sandbox(t);
    const [twice, rejected, redrilled] = curriculum.concepts.filter((c) => (c.register ?? 'architect') === 'architect');
    const drill = (slug: string, drilled_at: string, status: LedgerEntry['status']) =>
      ({ slug, register: 'architect' as const, drilled_at, draft_path: '-', status });
    const ledger: LedgerFile = {
      ...drillLedger('architect'),
      drills: [
        drill(twice.slug, '2026-05-01', 'draft'), // drilled twice, e.g. forced again with CONCEPT=
        drill(twice.slug, '2026-05-02', 'merged'),
        drill(rejected.slug, '2026-05-01', 'rejected'), // rejected, never redone
        drill(redrilled.slug, '2026-05-01', 'rejected'), // rejected, then drilled again
        drill(redrilled.slug, '2026-05-03', 'draft'),
        drill('retired-concept', '2026-05-01', 'draft') // no longer in the curriculum
      ]
    };
    writeJson(join(dir, 'ledger.json'), ledger);

    const run = runScript('src/list-concepts.ts', [], dir);

    assert.equal(run.status, 0, run.stderr);
    const total = curriculum.concepts.length;
    assert.ok(run.stdout.includes(`Drilled: 2 / ${total} (${total - 2} remaining)`), run.stdout);
    assert.ok(run.stdout.includes(`✓ 2026-05-02 [T${twice.tier}] ${twice.slug} — `), twice.slug);
    assert.ok(run.stdout.includes(`✓ 2026-05-03 [T${redrilled.tier}] ${redrilled.slug} — `), redrilled.slug);
    assert.ok(run.stdout.includes(`· [T${rejected.tier}] ${rejected.slug} — `), rejected.slug);
  });
});

describe('demo', () => {
  it('prints the default draft artifact, or a JSON summary with --json', (t) => {
    const dir = sandbox(t);

    const text = runScript('src/demo.ts', [], dir);
    assert.equal(text.status, 0, text.stderr);
    assert.ok(text.stdout.startsWith('# Portable pattern kit\n'));
    assert.ok(text.stdout.includes('Subject: portable agent pattern kits'));
    assert.ok(!text.stdout.includes('## Threat surface'), 'draft mode has no gold sections');

    const json = runScript('src/demo.ts', ['--json'], dir);
    assert.deepEqual(JSON.parse(json.stdout), {
      mode: 'draft',
      subject: 'portable agent pattern kits',
      output_path: null,
      suggested_name: 'draft-portable-agent-pattern-kits.md'
    });
  });

  it('gold mode writes the four review sections for a custom brief to --output', (t) => {
    const dir = sandbox(t);
    const brief = {
      subject: 'Edge Cases & Such!',
      primary_source_url: 'https://example.invalid/brief',
      bounded_claim: 'A bounded claim.',
      evidence_summary: 'An evidence summary.'
    };
    writeJson(join(dir, 'brief.json'), brief);
    const output = join(dir, 'nested', 'gold.md');

    const run = runScript(
      'src/demo.ts',
      ['--mode', 'gold', '--brief-file', join(dir, 'brief.json'), '--output', output, '--json'],
      dir
    );

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), {
      mode: 'gold',
      subject: brief.subject,
      output_path: output,
      suggested_name: 'gold-edge-cases-such.md'
    });
    const body = readFileSync(output, 'utf8');
    assert.ok(body.includes('Subject: Edge Cases & Such!'));
    for (const section of ['## Threat surface', '## Security controls', '## Context matrix', '## Exit rule']) {
      assert.ok(body.includes(section), section);
    }
  });
});

describe('local MCP stub', () => {
  const graph = () => ({
    nodes: readJson(join(REPO_ROOT, 'graph/nodes.json')),
    edges: readJson(join(REPO_ROOT, 'graph/edges.json'))
  });

  it('declares itself read-only in both the overview and the manifest', () => {
    assert.equal(getRepoOverview().mcp_mode, 'read-only');
    assert.equal(readJson<{ mode: string }>(join(REPO_ROOT, 'mcp/manifest.json')).mode, 'read-only');
  });

  it('implements every tool the manifest declares', async () => {
    // Each tool is exported under its camelCase name: get_repo_overview is getRepoOverview.
    const server: Record<string, unknown> = await import('../mcp/server.ts');
    const { tools } = readJson<{ tools: string[] }>(join(REPO_ROOT, 'mcp/manifest.json'));
    assert.ok(tools.length > 0, 'the manifest declares no tools');
    for (const tool of tools) {
      const impl = server[tool.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())];
      assert.equal(typeof impl, 'function', `mcp/manifest.json declares ${tool}; mcp/server.ts does not implement it`);
      assert.ok((impl as () => unknown)(), `${tool} returned nothing`);
    }
  });

  it('serves PATTERN.md, AXIOMS.md and SCENARIOS.md as-is', () => {
    const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');
    assert.equal(getPattern(), read('PATTERN.md'));
    assert.equal(getAxiomsAddressed(), read('AXIOMS.md'));
    assert.equal(getScenarios(), read('SCENARIOS.md'));
  });

  it('serves the file graph as-is, and `npm run mcp:demo` prints it with the overview', (t) => {
    assert.deepEqual(getGraph(), graph());
    const run = runScript('mcp/server.ts', [], sandbox(t));
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { overview: getRepoOverview(), graph: graph() });
  });

  // From a path with a space, the server still finds its files and still recognizes itself as the main module.
  it('finds its graph files, and runs as a script, from a checkout path that contains a space', async (t) => {
    // realpath: the macOS temp dir sits behind a symlink, and Node reports the main module by its real path.
    const root = join(realpathSync(sandbox(t)), 'with space');
    mkdirSync(join(root, 'mcp'), { recursive: true });
    mkdirSync(join(root, 'graph'));
    for (const rel of ['mcp/server.ts', 'graph/nodes.json', 'graph/edges.json']) {
      copyFileSync(join(REPO_ROOT, rel), join(root, rel));
    }
    const copy = await import(pathToFileURL(join(root, 'mcp/server.ts')).href);
    assert.deepEqual(copy.getGraph(), graph());

    const run = runScript(join(root, 'mcp/server.ts'), [], root);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { overview: getRepoOverview(), graph: graph() });
  });
});
