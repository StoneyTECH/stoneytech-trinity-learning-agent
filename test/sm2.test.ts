import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_SRS, nextSm2, type Quality, type SrsState } from '../src/sm2.ts';

// A fixed UTC instant, so no result depends on the machine's clock or timezone.
const TODAY = new Date('2026-05-02T12:00:00Z');
const MATURE: SrsState = { ease_factor: 2.5, interval: 6, repetitions: 2 };

describe('nextSm2', () => {
  it('starts a new card at ease 2.5 with no interval and no repetitions', () => {
    assert.deepEqual(INITIAL_SRS, { ease_factor: 2.5, interval: 0, repetitions: 0 });
  });

  it('reproduces the first real graded review in the study ledger', () => {
    // determinism-ladder, fresh card, graded 4/5 on 2026-05-02. The ledger recorded exactly this.
    assert.deepEqual(nextSm2(INITIAL_SRS, 4, new Date('2026-05-02T15:00:00Z')), {
      ease_factor: 2.5,
      interval: 1,
      repetitions: 1,
      next_due: '2026-05-03'
    });
  });

  it('schedules consecutive passes at 1 day, 6 days, then the previous interval times the ease', () => {
    // Quality 4 leaves the ease at 2.5, so every step is exact: 6 * 2.5 = 15, 15 * 2.5 = 37.5 -> 38, 38 * 2.5 = 95.
    let state: SrsState = INITIAL_SRS;
    const schedule: Array<[number, number]> = [];
    for (let review = 0; review < 5; review++) {
      state = nextSm2(state, 4, TODAY);
      schedule.push([state.repetitions, state.interval]);
    }
    assert.deepEqual(schedule, [
      [1, 1],
      [2, 6],
      [3, 15],
      [4, 38],
      [5, 95]
    ]);
  });

  it('grows the interval with the ease from before this review', () => {
    // 6 * 2.5 = 15 with the prior ease; the updated ease (2.6) would give 15.6 -> 16.
    const next = nextSm2(MATURE, 5, TODAY);
    assert.equal(next.interval, 15);
    assert.equal(next.ease_factor, 2.6);
  });

  it('moves the ease by the SM-2 formula for every grade, passes and lapses alike', () => {
    const expected: Record<Quality, number> = { 5: 2.6, 4: 2.5, 3: 2.36, 2: 2.18, 1: 1.96, 0: 1.7 };
    for (const q of [0, 1, 2, 3, 4, 5] as const) {
      assert.equal(nextSm2(MATURE, q, TODAY).ease_factor, expected[q], `quality ${q}`);
    }
  });

  it('never lets the ease fall below 1.3', () => {
    assert.equal(nextSm2({ ease_factor: 1.3, interval: 1, repetitions: 0 }, 0, TODAY).ease_factor, 1.3);
    assert.equal(nextSm2({ ease_factor: 1.4, interval: 6, repetitions: 2 }, 3, TODAY).ease_factor, 1.3);
  });

  it('treats 0-2 as a lapse that restarts the card tomorrow, and 3-5 as a pass', () => {
    const veteran: SrsState = { ease_factor: 2.5, interval: 40, repetitions: 5 };
    for (const q of [0, 1, 2] as const) {
      const next = nextSm2(veteran, q, TODAY);
      assert.deepEqual([next.repetitions, next.interval, next.next_due], [0, 1, '2026-05-03'], `quality ${q}`);
    }
    for (const q of [3, 4, 5] as const) {
      assert.equal(nextSm2(veteran, q, TODAY).repetitions, 6, `quality ${q}`);
    }
  });

  it('climbs the 1 -> 6 ladder again after a lapse', () => {
    const lapsed = nextSm2({ ease_factor: 2.5, interval: 40, repetitions: 5 }, 1, TODAY);
    const first = nextSm2(lapsed, 5, TODAY);
    const second = nextSm2(first, 5, TODAY);
    assert.deepEqual([first.repetitions, first.interval], [1, 1]);
    assert.deepEqual([second.repetitions, second.interval], [2, 6]);
  });

  it('computes next_due on the UTC calendar across month, year and leap-day boundaries', () => {
    const afterOneDay = (iso: string) => nextSm2(INITIAL_SRS, 5, new Date(iso)).next_due;
    assert.equal(afterOneDay('2026-01-31T08:00:00Z'), '2026-02-01');
    assert.equal(afterOneDay('2028-02-28T08:00:00Z'), '2028-02-29');
    assert.equal(afterOneDay('2026-05-02T00:00:00Z'), '2026-05-03');
    assert.equal(afterOneDay('2026-05-02T23:59:59Z'), '2026-05-03');
    const second = { ease_factor: 2.6, interval: 1, repetitions: 1 };
    assert.equal(nextSm2(second, 5, new Date('2026-12-28T08:00:00Z')).next_due, '2027-01-03');
  });

  it('does not mutate the prior state, INITIAL_SRS, or the date passed in', () => {
    const prior = { ...MATURE };
    const today = new Date(TODAY);
    nextSm2(prior, 5, today);
    nextSm2(INITIAL_SRS, 0, today);
    assert.deepEqual(prior, MATURE);
    assert.deepEqual(INITIAL_SRS, { ease_factor: 2.5, interval: 0, repetitions: 0 });
    assert.equal(today.toISOString(), TODAY.toISOString());
  });

  it(
    'rounds a fractional interval up, as the cited SM-2 reference specifies',
    {
      todo:
        'src/sm2.ts:59 uses Math.round, but Wozniak (1990), cited in the file header, says to round up. ' +
        '6 * 2.36 = 14.16 schedules 14 days; the reference gives 15. Fix the code or the citation.'
    },
    () => {
      assert.equal(nextSm2({ ease_factor: 2.36, interval: 6, repetitions: 2 }, 4, TODAY).interval, 15);
    }
  );
});
