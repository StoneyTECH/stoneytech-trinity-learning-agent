// The README names the teaching-draft and recall-question templates as the repo's portable
// contracts. These tests pin what each template must carry, not its exact wording.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadCurriculum } from '../src/picker.ts';
import { PRIMER_SYSTEM_PROMPT, buildPrimerUserPrompt } from '../src/prompt-template-primer.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from '../src/prompt-template.ts';
import { STUDY_SYSTEM_PROMPT, buildStudyUserPrompt } from '../src/study-prompt.ts';
import { conceptMatchesRegister, type Concept } from '../src/types.ts';
import { REPO_ROOT } from './helpers.ts';

const DATE = '2026-05-04';

// Synthetic values, so a match can only come from the concept, never from the template's own text.
const CONCEPT: Concept = {
  slug: 'fixture-concept',
  title: 'Fixture title for the prompt tests',
  tier: 1,
  register: 'architect',
  lever: 'fixture-lever',
  prerequisites: ['fixture-prereq-one', 'fixture-prereq-two'],
  tags: ['fixture-tag', 'axiom-7'],
  war_story_hint: 'Fixture war story about a very specific failure.',
  anchor_axiom: 77
};

function assertIncludesAll(text: string, expected: string[]): void {
  for (const piece of expected) assert.ok(text.includes(piece), `prompt is missing: ${piece}`);
}

const DRAFT_FIELDS = [
  CONCEPT.slug,
  CONCEPT.title,
  '#77',
  CONCEPT.lever,
  '["fixture-tag","axiom-7"]',
  'fixture-prereq-one, fixture-prereq-two',
  `> ${CONCEPT.war_story_hint}`,
  DATE
];

describe('draft and study user prompts', () => {
  it('carry every concept field into the architect draft prompt', () => {
    assertIncludesAll(buildUserPrompt(CONCEPT, DATE), DRAFT_FIELDS);
  });

  it('carry every concept field into the primer draft prompt, plus the series tease', () => {
    assertIncludesAll(buildPrimerUserPrompt(CONCEPT, DATE), [...DRAFT_FIELDS, 'Next in the Demystify AI series']);
  });

  it('carry every concept field into the study prompt', () => {
    assertIncludesAll(buildStudyUserPrompt(CONCEPT), [
      CONCEPT.slug,
      CONCEPT.title,
      '#77',
      CONCEPT.lever,
      'fixture-tag, axiom-7',
      CONCEPT.war_story_hint
    ]);
  });

  it('label tiers 1/2/3 as must-own / must-recognize / vocabulary in all three templates', () => {
    const labels = { 1: 'must-own', 2: 'must-recognize', 3: 'vocabulary' } as const;
    for (const tier of [1, 2, 3] as const) {
      const c = { ...CONCEPT, tier };
      assert.ok(buildUserPrompt(c, DATE).includes(`Tier: ${tier} (${labels[tier]})`), `architect, tier ${tier}`);
      assert.ok(buildStudyUserPrompt(c).includes(`Tier: ${tier} (${labels[tier]})`), `study, tier ${tier}`);
      assert.ok(buildPrimerUserPrompt(c, DATE).includes(`Tier: ${tier} (${labels[tier]} — `), `primer, tier ${tier}`);
    }
  });

  it('say explicitly when a concept is foundational', () => {
    const root = { ...CONCEPT, prerequisites: [] };
    assert.ok(buildUserPrompt(root, DATE).includes('(none — this is a foundational concept)'));
    assert.ok(buildPrimerUserPrompt(root, DATE).includes('(none — this is a foundational primer concept)'));
  });

  it('render every real curriculum concept with no undefined or [object Object] leaks', () => {
    // tsx strips types without checking them, so a missing field or a typo'd property
    // in a template would otherwise ship as the literal text "undefined".
    const { concepts } = loadCurriculum(join(REPO_ROOT, 'curriculum/concepts.json'));
    const leak = /\bundefined\b|\bNaN\b|\[object Object\]/;
    for (const c of concepts) {
      if (conceptMatchesRegister(c, 'architect')) assert.doesNotMatch(buildUserPrompt(c, DATE), leak, c.slug);
      if (conceptMatchesRegister(c, 'primer')) assert.doesNotMatch(buildPrimerUserPrompt(c, DATE), leak, c.slug);
      assert.doesNotMatch(buildStudyUserPrompt(c), leak, c.slug);
    }
  });
});

describe('system prompts, as the scripts that parse the model output rely on them', () => {
  it('ask the study model for the two JSON keys study.ts parses', () => {
    assert.match(STUDY_SYSTEM_PROMPT, /"question"/);
    assert.match(STUDY_SYSTEM_PROMPT, /"canonical_answer"/);
  });

  it('ask both draft models to open with frontmatter that includes an excerpt', () => {
    // drill.ts checks the draft starts with "---" and lifts `excerpt:` into the notification digest.
    for (const [name, prompt] of [
      ['architect', SYSTEM_PROMPT],
      ['primer', PRIMER_SYSTEM_PROMPT]
    ]) {
      assert.match(prompt, /Begin your reply with the opening "---"/, name);
      assert.match(prompt, /^\s+excerpt \(/m, name);
    }
  });
});
