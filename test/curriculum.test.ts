// Integrity checks on the committed curriculum data. These read the real files, and they are
// written to keep passing as the daily jobs append to the ledgers. They fail only on data the
// scripts could not have produced or cannot use. Files are parsed with JSON.parse directly:
// loadStudyLedger would turn a corrupt file into an empty ledger and let every check pass.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pickNextConcept } from '../src/picker.ts';
import type { StudyLedgerFile } from '../src/study-ledger.ts';
import {
  conceptMatchesRegister,
  type CurriculumFile,
  type LedgerEntry,
  type LedgerFile,
  type RegisterFilter
} from '../src/types.ts';
import { REPO_ROOT } from './helpers.ts';

function readRaw(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function parse<T>(rel: string): T {
  try {
    return JSON.parse(readRaw(rel)) as T;
  } catch (err) {
    throw new Error(`${rel} is not valid JSON: ${(err as Error).message}`);
  }
}

const curriculum = parse<CurriculumFile>('curriculum/concepts.json');
const ledger = parse<LedgerFile>('curriculum/ledger.json');
const studyLedger = parse<StudyLedgerFile>('curriculum/study-ledger.json');

const bySlug = new Map(curriculum.concepts.map((c) => [c.slug, c]));

function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value); // rejects 2026-02-30
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Run the real picker from an empty ledger until it stops, and return what it never picked. */
function unreachable(register: RegisterFilter): string[] {
  const drills: LedgerEntry[] = [];
  for (let i = 0; i <= curriculum.concepts.length; i++) {
    const next = pickNextConcept(curriculum, { ...ledger, drills }, register);
    if (!next) break;
    drills.push({ slug: next.slug, register, drilled_at: '2026-01-01', draft_path: '-', status: 'draft' });
  }
  assert.ok(drills.length <= curriculum.concepts.length, 'picker kept re-picking drilled concepts');
  const picked = new Set(drills.map((d) => d.slug));
  return curriculum.concepts.filter((c) => conceptMatchesRegister(c, register) && !picked.has(c.slug)).map((c) => c.slug);
}

// KNOWN DATA BUG (see the todo below): graph-constrained-execution is register 'both', but both of
// its prerequisites are architect-only, so the primer picker can never unlock it.
const KNOWN_UNREACHABLE: Record<RegisterFilter, string[]> = {
  architect: [],
  primer: ['graph-constrained-execution']
};

describe('curriculum/concepts.json', () => {
  it('uses the v2 curriculum schema these checks are written for', () => {
    assert.equal(curriculum.schema, 'learning-agent-curriculum/v2');
    assert.ok(curriculum.concepts.length > 0);
  });

  it('gives every concept the fields the picker and prompt templates read', () => {
    const problems: string[] = [];
    curriculum.concepts.forEach((c, i) => {
      const where = `concepts[${i}] ${c.slug}`;
      if (!isNonEmptyString(c.title)) problems.push(`${where}: title`);
      if (![1, 2, 3].includes(c.tier)) problems.push(`${where}: tier ${c.tier}`);
      if (c.register !== undefined && !['architect', 'primer', 'both'].includes(c.register))
        problems.push(`${where}: register ${c.register}`);
      if (!isNonEmptyString(c.lever)) problems.push(`${where}: lever`);
      if (!Array.isArray(c.prerequisites) || !c.prerequisites.every(isNonEmptyString))
        problems.push(`${where}: prerequisites`);
      if (!Array.isArray(c.tags) || !c.tags.every(isNonEmptyString)) problems.push(`${where}: tags`);
      if (!isNonEmptyString(c.war_story_hint)) problems.push(`${where}: war_story_hint`);
      if (!Number.isInteger(c.anchor_axiom) || c.anchor_axiom < 1) problems.push(`${where}: anchor_axiom`);
    });
    assert.deepEqual(problems, []);
  });

  it('has unique slugs that are safe inside draft filenames', () => {
    const slugs = curriculum.concepts.map((c) => c.slug);
    assert.deepEqual(slugs.filter((s, i) => slugs.indexOf(s) !== i), [], 'duplicate slugs');
    // drill.ts writes daily-drill-<date>-<slug>.svx, so a slug must never contain a path separator.
    assert.deepEqual(slugs.filter((s) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)), [], 'non-kebab-case slugs');
  });

  it('only lists prerequisites that are other concepts in the curriculum', () => {
    const dangling = curriculum.concepts.flatMap((c) =>
      c.prerequisites.filter((p) => p === c.slug || !bySlug.has(p)).map((p) => `${c.slug} -> ${p}`)
    );
    assert.deepEqual(dangling, []);
  });

  for (const register of ['architect', 'primer'] as const) {
    it(`lets the picker eventually reach every ${register} concept`, () => {
      const stuck = unreachable(register).filter((slug) => !KNOWN_UNREACHABLE[register].includes(slug));
      assert.deepEqual(stuck, [], `never picked for ${register}: missing, cross-register or circular prerequisites?`);
    });
  }

  it(
    'lets the picker reach graph-constrained-execution in the primer register',
    {
      todo:
        "curriculum/concepts.json: graph-constrained-execution is register 'both', but its prerequisites " +
        '(determinism-ladder, agents-vs-workflows) are architect-only, so it can never be picked for primer.'
    },
    () => {
      assert.deepEqual(unreachable('primer'), []);
    }
  );
});

describe('curriculum/ledger.json', () => {
  it('uses the v2 ledger schema', () => {
    assert.equal(ledger.schema, 'learning-agent-ledger/v2');
  });

  it('records only well-formed drills of curriculum concepts in a register they support', () => {
    const problems: string[] = [];
    ledger.drills.forEach((d, i) => {
      const where = `drills[${i}] ${d.slug}`;
      const c = bySlug.get(d.slug);
      if (!c) problems.push(`${where}: not in concepts.json`);
      if (d.register !== undefined && d.register !== 'architect' && d.register !== 'primer')
        problems.push(`${where}: register ${d.register}`);
      else if (c && !conceptMatchesRegister(c, d.register ?? 'architect'))
        problems.push(`${where}: drilled as ${d.register ?? 'architect'}, but the concept is ${c.register}`);
      if (!isIsoDate(d.drilled_at)) problems.push(`${where}: drilled_at ${d.drilled_at}`);
      if (!['draft', 'merged', 'rejected'].includes(d.status)) problems.push(`${where}: status ${d.status}`);
      if (!isNonEmptyString(d.draft_path)) problems.push(`${where}: draft_path`);
    });
    assert.deepEqual(problems, []);
  });
});

describe('curriculum/study-ledger.json', () => {
  it('uses the v1 study-ledger schema', () => {
    assert.equal(studyLedger.schema, 'learning-agent-study-ledger/v1');
  });

  it('holds at most one entry per curriculum concept, with valid SM-2 state and attempts', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    studyLedger.entries.forEach((e, i) => {
      const where = `entries[${i}] ${e.slug}`;
      if (!bySlug.has(e.slug)) problems.push(`${where}: not in concepts.json`);
      if (seen.has(e.slug)) problems.push(`${where}: duplicate entry`);
      seen.add(e.slug);
      if (typeof e.ease_factor !== 'number' || e.ease_factor < 1.3) problems.push(`${where}: ease_factor`);
      if (!Number.isInteger(e.interval) || e.interval < 0) problems.push(`${where}: interval`);
      if (!Number.isInteger(e.repetitions) || e.repetitions < 0) problems.push(`${where}: repetitions`);
      // study.ts only saves an entry after appending an attempt, and an entry with none is never picked.
      if (!Array.isArray(e.attempts) || e.attempts.length === 0) problems.push(`${where}: no attempts`);
      (e.attempts ?? []).forEach((a, j) => {
        const at = `${where} attempts[${j}]`;
        if (!isIsoDate(a.attempted_at)) problems.push(`${at}: attempted_at`);
        if (!isNonEmptyString(a.question) || !isNonEmptyString(a.canonical_answer)) problems.push(`${at}: Q+A`);
        if (a.quality !== undefined && !(Number.isInteger(a.quality) && a.quality >= 0 && a.quality <= 5))
          problems.push(`${at}: quality ${a.quality}`);
        if (a.quality !== undefined && !isIsoDate(a.graded_at)) problems.push(`${at}: graded_at`);
      });
    });
    assert.deepEqual(problems, []);
  });

  it('keeps graded concepts scheduled: last_studied matches the latest grade and next_due is set', () => {
    // pickNextStudySlug only ever returns a graded concept through next_due, so a graded entry
    // without one silently drops out of the review rotation.
    const problems: string[] = [];
    for (const e of studyLedger.entries) {
      const latest = e.attempts.filter((a) => a.quality !== undefined).at(-1);
      if (!latest) {
        if (e.last_studied !== undefined) problems.push(`${e.slug}: last_studied without any graded attempt`);
      } else {
        if (e.last_studied !== latest.graded_at) problems.push(`${e.slug}: last_studied ${e.last_studied}`);
        if (!isIsoDate(e.next_due)) problems.push(`${e.slug}: next_due ${e.next_due}`);
      }
    }
    assert.deepEqual(problems, []);
  });
});

describe('ledger file format', () => {
  for (const rel of ['curriculum/ledger.json', 'curriculum/study-ledger.json']) {
    it(`${rel} is stored exactly as the scripts write it, so automated commits diff cleanly`, () => {
      const raw = readRaw(rel);
      assert.equal(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n');
    });
  }
});
