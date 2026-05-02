// SuperMemo-2 (SM-2) spaced-repetition algorithm.
//
// Reference: Wozniak, P. A. (1990). "Optimization of learning."
// https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
//
// Inputs: prior state (ease_factor, interval, repetitions) + a quality grade
//   q ∈ {0..5} where:
//     5 — perfect recall, instant
//     4 — recall with hesitation
//     3 — recall with significant effort, would have failed without hint
//     2 — incorrect, but the right answer felt familiar
//     1 — incorrect, the right answer felt new
//     0 — total blank
//
// Outputs: next ease_factor, next interval (days), next repetitions count.
//
// Behavior:
//   - q < 3 → repetitions reset to 0, interval reset to 1 day (failure restarts the card).
//   - q ≥ 3 → repetitions += 1; interval grows: 1 → 6 → previous*EF.
//   - EF updates as: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)). Floor at 1.3.

export interface SrsState {
  /** Ease factor; standard SM-2 starts at 2.5, floor 1.3. */
  ease_factor: number;
  /** Current interval in days. */
  interval: number;
  /** Successful repetitions in a row. Reset on failure. */
  repetitions: number;
}

export interface SrsUpdate extends SrsState {
  /** ISO date (YYYY-MM-DD) when next review is due. */
  next_due: string;
}

export const INITIAL_SRS: SrsState = {
  ease_factor: 2.5,
  interval: 0, // First review hasn't happened yet.
  repetitions: 0
};

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** Compute the next SM-2 state from the prior state and the quality grade. */
export function nextSm2(prior: SrsState, quality: Quality, today: Date = new Date()): SrsUpdate {
  const q = quality;

  let { ease_factor, repetitions, interval } = prior;

  if (q < 3) {
    // Failure path — reset repetitions, short interval.
    repetitions = 0;
    interval = 1;
  } else {
    // Success path — incrementing schedule.
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease_factor);
  }

  // EF update — applied on every review regardless of pass/fail.
  ease_factor =
    ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  // next_due = today + interval days.
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() + interval);
  const next_due = due.toISOString().slice(0, 10);

  return { ease_factor: round2(ease_factor), interval, repetitions, next_due };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
