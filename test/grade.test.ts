// grade.ts is a CLI with top-level side effects, so it runs as a child process against a temp
// study ledger (see runScript in helpers.ts: no API key, no bridge, fetch disabled).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { StudyLedgerFile } from '../src/study-ledger.ts';
import { addDays, guardRealData, readJson, runScript, sandbox, utcToday, writeJson } from './helpers.ts';

after(guardRealData());

// 'in-progress' passed its first two reviews (ease 2.6, 6-day interval) and has since been asked
// twice without a grade, which is how the daily study job leaves a concept until it is graded.
function fixture(): StudyLedgerFile {
  return {
    schema: 'learning-agent-study-ledger/v1',
    description: 'grade.ts test fixture',
    entries: [
      {
        slug: 'in-progress',
        ease_factor: 2.6,
        interval: 6,
        repetitions: 2,
        attempts: [
          { attempted_at: '2026-04-14', question: 'q1', canonical_answer: 'a1', quality: 5, graded_at: '2026-04-14' },
          { attempted_at: '2026-04-15', question: 'q2', canonical_answer: 'a2', quality: 4, graded_at: '2026-04-15' },
          { attempted_at: '2026-04-21', question: 'q3', canonical_answer: 'a3' },
          { attempted_at: '2026-04-22', question: 'q4', canonical_answer: 'a4' }
        ],
        last_studied: '2026-04-15',
        next_due: '2026-04-21'
      },
      {
        slug: 'already-graded',
        ease_factor: 2.5,
        interval: 1,
        repetitions: 1,
        attempts: [
          { attempted_at: '2026-05-02', question: 'q', canonical_answer: 'a', quality: 4, graded_at: '2026-05-02' }
        ],
        last_studied: '2026-05-02',
        next_due: '2026-05-03'
      }
    ]
  };
}

function setUp(dir: string): string {
  const path = join(dir, 'study-ledger.json');
  writeJson(path, fixture());
  return path;
}

describe('npm run grade', () => {
  it('grades the latest open attempt, reschedules the concept with SM-2 and keeps the notes', (t) => {
    const dir = sandbox(t);
    const path = setUp(dir);
    const original = fixture().entries;

    const dayBefore = utcToday();
    const run = runScript('src/grade.ts', ['in-progress', '4', 'needed', 'a', 'hint'], dir);
    const dayAfter = utcToday();

    assert.equal(run.status, 0, run.stderr);
    const [graded, other] = readJson<StudyLedgerFile>(path).entries;
    const today = graded.last_studied ?? '';
    assert.ok([dayBefore, dayAfter].includes(today), `last_studied ${today} should be today (UTC)`);
    assert.deepEqual(graded, {
      ...original[0],
      ease_factor: 2.6,
      interval: 16, // 6 * 2.6 = 15.6
      repetitions: 3,
      last_studied: today,
      next_due: addDays(today, 16),
      attempts: [
        ...original[0].attempts.slice(0, 3), // an older open attempt stays ungraded
        { ...original[0].attempts[3], quality: 4, graded_at: today, notes: 'needed a hint' }
      ]
    });
    assert.deepEqual(other, original[1]);
    assert.match(run.stdout, /Graded in-progress: 4\/5/);
    assert.ok(run.stdout.includes(`next due: ${addDays(today, 16)}`));
  });

  it('rejects a missing or out-of-range grade and leaves the ledger alone', (t) => {
    const dir = sandbox(t);
    const path = setUp(dir);
    const before = readFileSync(path, 'utf8');
    const cases: Array<[string[], RegExp]> = [
      [['in-progress'], /Usage: npm run grade <slug> <0\.\.5>/],
      [['in-progress', '6'], /Quality must be an integer 0-5/],
      [['in-progress', 'five'], /Quality must be an integer 0-5/]
    ];
    for (const [args, message] of cases) {
      const run = runScript('src/grade.ts', args, dir);
      assert.equal(run.status, 1, `grade ${args.join(' ')}`);
      assert.match(run.stderr, message);
    }
    assert.equal(readFileSync(path, 'utf8'), before);
  });

  it('refuses a concept with no open attempt, without saving anything', (t) => {
    const dir = sandbox(t);
    const path = setUp(dir);
    const before = readFileSync(path, 'utf8');
    const cases: Array<[string, RegExp]> = [
      ['already-graded', /already graded \(4\/5 on 2026-05-02\)/],
      ['never-studied', /No attempts logged for never-studied/] // no stub entry gets written either
    ];
    for (const [slug, message] of cases) {
      const run = runScript('src/grade.ts', [slug, '4'], dir);
      assert.equal(run.status, 1, slug);
      assert.match(run.stderr, message);
    }
    assert.equal(readFileSync(path, 'utf8'), before);
  });

  it('with notifications on but no bridge configured, still grades and skips delivery', (t) => {
    const dir = sandbox(t);
    const path = setUp(dir);

    const run = runScript('src/grade.ts', ['in-progress', '5'], dir, { NOTIFY: undefined });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Notification bridge not configured; skipping delivery\./);
    assert.equal(readJson<StudyLedgerFile>(path).entries[0].attempts.at(-1)?.quality, 5);
  });

  // "3.5" and "4x" get the usage error and leave the ledger alone, instead of being stored as 3 and 4.
  it('rejects a fractional or non-numeric grade instead of truncating it', (t) => {
    const dir = sandbox(t);
    const path = setUp(dir);
    const before = readFileSync(path, 'utf8');
    for (const grade of ['3.5', '4x']) {
      const run = runScript('src/grade.ts', ['in-progress', grade], dir);
      assert.equal(run.status, 1, `grade ${grade}`);
      assert.match(run.stderr, /Quality must be an integer 0-5/);
    }
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});
