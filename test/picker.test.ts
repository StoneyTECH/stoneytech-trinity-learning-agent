import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickNextConcept } from '../src/picker.ts';
import {
  conceptMatchesRegister,
  type Concept,
  type CurriculumFile,
  type LedgerEntry,
  type LedgerFile,
  type RegisterFilter
} from '../src/types.ts';

// Every fixture concept gets its own lever unless a test says otherwise,
// so lever recency never breaks a tie by accident.
function concept(slug: string, overrides: Partial<Concept> = {}): Concept {
  return {
    slug,
    title: slug,
    tier: 1,
    register: 'architect',
    lever: `lever-${slug}`,
    prerequisites: [],
    tags: [],
    war_story_hint: 'hint',
    anchor_axiom: 1,
    ...overrides
  };
}

function curriculum(...concepts: Concept[]): CurriculumFile {
  return { schema: 'test', description: 'test', concepts };
}

function drilled(slug: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    slug,
    register: 'architect',
    drilled_at: '2026-05-01',
    draft_path: `drafts/${slug}.svx`,
    status: 'draft',
    ...overrides
  };
}

function ledger(...drills: LedgerEntry[]): LedgerFile {
  return { schema: 'test', description: 'test', drills };
}

function pick(c: CurriculumFile, l: LedgerFile, register?: RegisterFilter): string | null {
  return pickNextConcept(c, l, register)?.slug ?? null;
}

describe('conceptMatchesRegister', () => {
  it('treats a missing register as architect and "both" as either', () => {
    assert.equal(conceptMatchesRegister(concept('legacy', { register: undefined }), 'architect'), true);
    assert.equal(conceptMatchesRegister(concept('legacy', { register: undefined }), 'primer'), false);
    assert.equal(conceptMatchesRegister(concept('shared', { register: 'both' }), 'architect'), true);
    assert.equal(conceptMatchesRegister(concept('shared', { register: 'both' }), 'primer'), true);
    assert.equal(conceptMatchesRegister(concept('primer', { register: 'primer' }), 'architect'), false);
  });
});

describe('pickNextConcept', () => {
  it('defaults to the architect register and only offers concepts in the requested register', () => {
    const c = curriculum(concept('p', { register: 'primer' }), concept('a'), concept('b', { register: 'both' }));
    assert.equal(pick(c, ledger()), 'a');
    assert.equal(pick(c, ledger(), 'primer'), 'p');
    assert.equal(pick(c, ledger(drilled('p', { register: 'primer' })), 'primer'), 'b');
    assert.equal(pick(c, ledger(drilled('a')), 'architect'), 'b');
  });

  it('skips concepts drilled in this register, but not ones drilled only in the other register', () => {
    const c = curriculum(concept('x', { register: 'both' }), concept('a'));
    assert.equal(pick(c, ledger(drilled('x', { register: 'primer' }))), 'x');
    assert.equal(pick(c, ledger(drilled('x'))), 'a');
  });

  it('reads ledger entries without a register as architect drills (v1 ledgers)', () => {
    const c = curriculum(concept('x', { register: 'both' }), concept('y', { register: 'both' }));
    const v1 = ledger(drilled('x', { register: undefined }));
    assert.equal(pick(c, v1, 'architect'), 'y');
    assert.equal(pick(c, v1, 'primer'), 'x');
  });

  it('waits until every prerequisite is drilled in the same register', () => {
    const c = curriculum(
      concept('root', { tier: 3, register: 'both' }),
      concept('other', { tier: 3, register: 'both' }),
      concept('child', { prerequisites: ['root', 'other'] })
    );
    // child is tier 1, so it would win the moment it became eligible.
    assert.equal(pick(c, ledger()), 'root');
    assert.equal(pick(c, ledger(drilled('root'))), 'other');
    assert.equal(pick(c, ledger(drilled('root'), drilled('other'))), 'child');
    const drilledOnlyAsPrimer = ledger(
      drilled('root', { register: 'primer' }),
      drilled('other', { register: 'primer' })
    );
    assert.equal(pick(c, drilledOnlyAsPrimer), 'root');
  });

  it('treats a rejected drill as not drilled: the concept returns and unlocks nothing', () => {
    const c = curriculum(concept('root', { tier: 2 }), concept('child', { prerequisites: ['root'] }));
    assert.equal(pick(c, ledger(drilled('root', { status: 'rejected' }))), 'root');
    assert.equal(pick(c, ledger(drilled('root', { status: 'merged' }))), 'child');
  });

  it('prefers a lower tier, then fewer prerequisites', () => {
    const c = curriculum(
      concept('tier-two', { tier: 2 }),
      concept('two-prereqs', { prerequisites: ['base-1', 'base-2'] }),
      concept('one-prereq', { prerequisites: ['base-1'] }),
      concept('base-1', { tier: 3 }),
      concept('base-2', { tier: 3 })
    );
    const bases = [drilled('base-1'), drilled('base-2')];
    assert.equal(pick(c, ledger(...bases)), 'one-prereq');
    assert.equal(pick(c, ledger(...bases, drilled('one-prereq'))), 'two-prereqs');
    assert.equal(pick(c, ledger(...bases, drilled('one-prereq'), drilled('two-prereqs'))), 'tier-two');
  });

  it('breaks remaining ties toward the lever least recently drilled in this register', () => {
    const candidates = [concept('a', { lever: 'x' }), concept('b', { lever: 'y' })];
    const history = [concept('p', { lever: 'x' }), concept('q', { lever: 'y' })];
    const recent = ledger(drilled('p'), drilled('q')); // x, then y
    assert.equal(pick(curriculum(...candidates, concept('c', { lever: 'z' }), ...history), recent), 'c');
    assert.equal(pick(curriculum(...candidates, ...history), recent), 'a');
  });

  it('counts only the last five drills in this register as recent', () => {
    const history = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'].map((slug) => concept(slug));
    const drills = ledger(...history.map((h) => drilled(h.slug)));
    const fresh = concept('fresh', { lever: 'never-drilled' });
    // Last touched six drills ago: no longer recent, so it ties with a never-drilled lever
    // and curriculum order decides.
    assert.equal(pick(curriculum(concept('a', { lever: 'lever-d0' }), fresh, ...history), drills), 'a');
    // Last touched five drills ago: still recent, so it loses to the never-drilled lever.
    assert.equal(pick(curriculum(concept('a', { lever: 'lever-d1' }), fresh, ...history), drills), 'fresh');
  });

  it("ignores the other register's history when judging recency", () => {
    const c = curriculum(
      concept('a', { lever: 'x', register: 'both' }),
      concept('b', { lever: 'y', register: 'both' }),
      concept('p', { lever: 'x', register: 'both' })
    );
    const l = ledger(drilled('p', { register: 'primer' }));
    assert.equal(pick(c, l, 'architect'), 'a');
    assert.equal(pick(c, l, 'primer'), 'b');
  });

  it('falls back to curriculum order when nothing else separates two concepts', () => {
    assert.equal(pick(curriculum(concept('first'), concept('second')), ledger()), 'first');
    assert.equal(pick(curriculum(concept('second'), concept('first')), ledger()), 'second');
  });

  it('returns null when nothing is eligible', () => {
    assert.equal(pick(curriculum(), ledger()), null);
    assert.equal(pick(curriculum(concept('a')), ledger(drilled('a'))), null);
    assert.equal(pick(curriculum(concept('a', { prerequisites: ['missing'] })), ledger()), null);
    assert.equal(pick(curriculum(concept('a')), ledger(), 'primer'), null);
  });

  it('tolerates ledger entries for concepts that have left the curriculum', () => {
    assert.equal(pick(curriculum(concept('a')), ledger(drilled('retired'))), 'a');
  });

  it('does not reorder or mutate the curriculum or ledger it is given', () => {
    const c = curriculum(concept('b', { tier: 2 }), concept('a'));
    const l = ledger(drilled('retired'));
    const before = structuredClone({ c, l });
    pickNextConcept(c, l);
    assert.deepEqual({ c, l }, before);
  });

  it(
    'judges recency by the latest drill of each lever',
    {
      todo:
        'src/picker.ts:53-54 uses indexOf, which finds the OLDEST occurrence in the recent window. ' +
        'After drills on levers x, y, x it treats x as staler than y and picks the x concept. Should be lastIndexOf.'
    },
    () => {
      const c = curriculum(
        concept('a', { lever: 'x' }),
        concept('b', { lever: 'y' }),
        concept('p', { lever: 'x' }),
        concept('q', { lever: 'y' }),
        concept('r', { lever: 'x' })
      );
      assert.equal(pick(c, ledger(drilled('p'), drilled('q'), drilled('r'))), 'b');
    }
  );
});
