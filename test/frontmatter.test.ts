// drill.ts only reaches its frontmatter check after a model call, so the check lives in
// src/frontmatter.ts and is tested here directly, with console.warn captured.

import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { repairFrontmatter } from '../src/frontmatter.ts';
import { PRIMER_SYSTEM_PROMPT } from '../src/prompt-template-primer.ts';
import { SYSTEM_PROMPT } from '../src/prompt-template.ts';

/** The <script> block a draft prompt requires right after the closing ---, exactly as the prompt spells it. */
function requiredScript(prompt: string): string {
  const block = prompt.match(/```svelte\n(<script>[\s\S]*?<\/script>)\n```/)?.[1];
  assert.ok(block, 'the prompt no longer spells out the <script> block');
  return block;
}

// Frontmatter with the fields the draft prompts ask for, nested blocks included.
const YAML = [
  'title: "Graph-constrained execution"',
  'date: 2026-05-03',
  'minutes: 9',
  'tags: ["orchestration", "axiom-2"]',
  'excerpt: "Put the agent on a graph, and every edge becomes a contract you can test."',
  'verification:',
  '  status: pending-panel',
  '  panel_architecture: "GVAR v3.3 — pending first run via webhook"',
  'axioms_applied: [2]',
  'axiom_outcomes:',
  '  - n: 2',
  '    verdict: held',
  '    note: "The graph moves routing out of the model."'
].join('\n');

const SCRIPT = requiredScript(SYSTEM_PROMPT);
const BODY = '## A relay race with no baton\n\nThe first run passed every eval.\n';

/** Runs repairFrontmatter with console.warn captured, returning the text and what it warned. */
function repairer(t: TestContext) {
  const warn = t.mock.method(console, 'warn', () => {});
  return (draft: string) => {
    warn.mock.resetCalls();
    const text = repairFrontmatter(draft);
    return { text, warnings: warn.mock.calls.map((call) => String(call.arguments[0])) };
  };
}

describe('repairFrontmatter', () => {
  it('passes a complete draft through untouched, without a warning', (t) => {
    const draft = `---\n${YAML}\n---\n\n${SCRIPT}\n\n${BODY}`;
    assert.deepEqual(repairer(t)(draft), { text: draft, warnings: [] });
  });

  for (const [register, prompt] of [
    ['architect', SYSTEM_PROMPT],
    ['primer', PRIMER_SYSTEM_PROMPT]
  ] as const) {
    // The 2026-05-03 failure, a draft missing its closing ---: the --- now goes before the <script> block,
    // leaving only YAML in the frontmatter. It used to go before the first heading, after the block.
    it(`closes an unterminated frontmatter before the <script> block the ${register} prompt requires`, (t) => {
      const script = requiredScript(prompt);
      const { text, warnings } = repairer(t)(`---\n${YAML}\n\n${script}\n\n${BODY}`);
      assert.equal(text, `---\n${YAML}\n---\n\n${script}\n\n${BODY}`);
      assert.equal(warnings.length, 2);
      assert.match(warnings[0], /frontmatter is unterminated/);
      assert.match(warnings[1], /Inserted --- before the <script> block/);
    });
  }

  it('also finds the <script> block when no blank line separates it from the YAML', (t) => {
    const { text } = repairer(t)(`---\n${YAML}\n${SCRIPT}\n\n${BODY}`);
    assert.equal(text, `---\n${YAML}\n---\n\n${SCRIPT}\n\n${BODY}`);
  });

  it('closes it before the first heading when the draft has no <script> block', (t) => {
    const { text, warnings } = repairer(t)(`\n---\n${YAML}\n\n${BODY}`);
    assert.equal(text, `---\n${YAML}\n---\n\n${BODY}`);
    assert.match(warnings[1], /Inserted --- before first heading/);
  });

  it('warns and returns the draft unchanged when it cannot find the frontmatter or where the body starts', (t) => {
    const repair = repairer(t);
    assert.deepEqual(repair(BODY), {
      text: BODY,
      warnings: ['⚠ Draft does not begin with frontmatter delimiter. Manual review required.']
    });
    const noBoundary = `---\n${YAML}\nA paragraph right under the YAML, with no heading anywhere.\n`;
    const { text, warnings } = repair(noBoundary);
    assert.equal(text, noBoundary);
    assert.match(warnings.at(-1) ?? '', /Could not auto-repair/);
  });
});
