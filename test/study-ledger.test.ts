import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  getOrCreateEntry,
  loadStudyLedger,
  pickNextStudySlug,
  saveStudyLedger,
  type StudyAttempt,
  type StudyEntry,
  type StudyLedgerFile
} from '../src/study-ledger.ts';
import { sandbox } from './helpers.ts';

const TODAY = '2026-05-10';

function open(): StudyAttempt {
  return { attempted_at: '2026-05-01', question: 'q', canonical_answer: 'a' };
}

function graded(quality: StudyAttempt['quality'] = 4): StudyAttempt {
  return { ...open(), quality, graded_at: '2026-05-01' };
}

/** A reviewed entry, due on the given date. */
function entry(slug: string, next_due: string, overrides: Partial<StudyEntry> = {}): StudyEntry {
  return {
    slug,
    ease_factor: 2.5,
    interval: 1,
    repetitions: 1,
    attempts: [graded()],
    last_studied: '2026-05-01',
    next_due,
    ...overrides
  };
}

function studyLedger(...entries: StudyEntry[]): StudyLedgerFile {
  return { schema: 'learning-agent-study-ledger/v1', description: 'test', entries };
}

describe('pickNextStudySlug', () => {
  it('returns null when there is nothing to choose from', () => {
    assert.equal(pickNextStudySlug(studyLedger(), [], TODAY), null);
  });

  it('finishes an open (ungraded) attempt before anything else', () => {
    const l = studyLedger(
      entry('overdue', '2026-01-01'),
      entry('open', '2026-12-31', { attempts: [graded(), open()] })
    );
    assert.equal(pickNextStudySlug(l, ['never-studied', 'overdue', 'open'], TODAY), 'open');
  });

  it('only counts the most recent attempt as open', () => {
    const l = studyLedger(entry('stale-open', '2026-12-31', { attempts: [open(), graded()] }));
    assert.equal(pickNextStudySlug(l, ['stale-open', 'never-studied'], TODAY), 'never-studied');
  });

  it('then introduces never-studied concepts, in the order given', () => {
    const l = studyLedger(entry('overdue', '2026-01-01'));
    assert.equal(pickNextStudySlug(l, ['overdue', 'new-1', 'new-2'], TODAY), 'new-1');
  });

  it('then reviews the earliest-due concept, most overdue first', () => {
    const l = studyLedger(
      entry('upcoming', '2026-12-31'),
      entry('due-today', TODAY),
      entry('overdue', '2026-05-01')
    );
    assert.equal(pickNextStudySlug(l, ['upcoming', 'due-today', 'overdue'], TODAY), 'overdue');
    assert.equal(pickNextStudySlug(l, ['upcoming', 'due-today'], TODAY), 'due-today');
  });

  it('with nothing due, offers the soonest upcoming review', () => {
    const l = studyLedger(entry('far', '2026-12-31'), entry('soon', '2026-05-11'));
    assert.equal(pickNextStudySlug(l, ['far', 'soon'], TODAY), 'soon');
  });

  it('ignores ledger entries for slugs it was not offered', () => {
    const l = studyLedger(entry('retired-open', '2026-01-01', { attempts: [open()] }), entry('kept', '2026-06-01'));
    assert.equal(pickNextStudySlug(l, ['kept'], TODAY), 'kept');
  });
});

describe('getOrCreateEntry', () => {
  it('adds a fresh SM-2 entry once, then keeps returning that same entry', () => {
    const l = studyLedger();
    const created = getOrCreateEntry(l, 'x');
    assert.deepEqual(created, { slug: 'x', ease_factor: 2.5, interval: 0, repetitions: 0, attempts: [] });
    assert.equal(getOrCreateEntry(l, 'x'), created);
    assert.equal(l.entries.length, 1);
    assert.notEqual(getOrCreateEntry(l, 'y').attempts, created.attempts, 'entries must not share an attempts array');
  });

  it('returns an existing entry as-is', () => {
    const existing = entry('x', '2026-06-01', { ease_factor: 1.9 });
    const l = studyLedger(existing);
    assert.equal(getOrCreateEntry(l, 'x'), existing);
    assert.deepEqual(l.entries, [entry('x', '2026-06-01', { ease_factor: 1.9 })]);
  });
});

describe('loadStudyLedger / saveStudyLedger', () => {
  it('round-trips through disk as 2-space JSON with a trailing newline', (t) => {
    const path = join(sandbox(t), 'study-ledger.json');
    const l = studyLedger(entry('x', '2026-06-01', { attempts: [graded(5), open()] }));
    saveStudyLedger(path, l);
    assert.equal(readFileSync(path, 'utf8'), JSON.stringify(l, null, 2) + '\n');
    assert.deepEqual(loadStudyLedger(path), l);
  });

  it('starts from an empty v1 ledger when the file does not exist yet', (t) => {
    const l = loadStudyLedger(join(sandbox(t), 'missing.json'));
    assert.equal(l.schema, 'learning-agent-study-ledger/v1');
    assert.deepEqual(l.entries, []);
  });

  // Entries added to one missing-file ledger must not show up in the next one loaded in the same process.
  it('hands out a fresh empty ledger on every missing-file load', (t) => {
    const dir = sandbox(t);
    const first = loadStudyLedger(join(dir, 'one.json'));
    try {
      getOrCreateEntry(first, 'leaked');
      assert.deepEqual(loadStudyLedger(join(dir, 'two.json')).entries, []);
    } finally {
      first.entries.length = 0; // undo the leak so later tests in this file see a clean fallback
    }
  });

  // Only a missing file loads as empty: a corrupt or unreadable one throws, naming the file, so nothing saves over it.
  it('refuses to treat a malformed or unreadable ledger file as empty', (t) => {
    const dir = sandbox(t);
    const path = join(dir, 'study-ledger.json');
    writeFileSync(path, '{ "entries": [ ');
    const naming = (file: string) => (err: unknown) => err instanceof Error && err.message.includes(file);
    assert.throws(() => loadStudyLedger(path), naming(path));
    assert.throws(() => loadStudyLedger(dir), naming(dir)); // exists, but reading it fails (EISDIR)
  });
});
