// Study ledger — SR state per concept. Distinct from the drill ledger
// (which tracks essay-draft generation). Same curriculum, different state.

import { readFileSync, writeFileSync } from 'fs';
import type { SrsState } from './sm2.ts';
import { INITIAL_SRS } from './sm2.ts';

export interface StudyAttempt {
  attempted_at: string; // ISO date
  question: string;
  canonical_answer: string;
  quality?: 0 | 1 | 2 | 3 | 4 | 5; // populated only after `npm run grade`
  graded_at?: string;
  notes?: string;
}

export interface StudyEntry extends SrsState {
  slug: string;
  /** ISO date of the last completed review (most recent attempt with a quality grade). */
  last_studied?: string;
  /** ISO date this concept becomes due again. */
  next_due?: string;
  /** All attempts, append-only. The most recent ungraded one is the "open" attempt. */
  attempts: StudyAttempt[];
}

export interface StudyLedgerFile {
  schema: string;
  description: string;
  entries: StudyEntry[];
}

const EMPTY_LEDGER: StudyLedgerFile = {
  schema: 'learning-agent-study-ledger/v1',
  description:
    'Spaced-repetition state per concept. Each entry tracks SM-2 (ease_factor / interval / repetitions / next_due) plus all attempts.',
  entries: []
};

export function loadStudyLedger(path: string): StudyLedgerFile {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return EMPTY_LEDGER;
  }
}

export function saveStudyLedger(path: string, ledger: StudyLedgerFile): void {
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n', 'utf-8');
}

export function getOrCreateEntry(ledger: StudyLedgerFile, slug: string): StudyEntry {
  let entry = ledger.entries.find((e) => e.slug === slug);
  if (!entry) {
    entry = { slug, ...INITIAL_SRS, attempts: [] };
    ledger.entries.push(entry);
  }
  return entry;
}

/**
 * Pick the next concept due for study, from a list of available slugs.
 * Priority:
 *   1. Concepts with an open (ungraded) attempt — finish what you started.
 *   2. Concepts that have never been studied (no entry).
 *   3. Concepts whose next_due is on or before today.
 *   4. Concepts whose next_due is in the future, sorted by next_due asc
 *      (i.e. show the soonest-due one early — useful when nothing's actually
 *      due yet but you want to keep practicing).
 *
 * Returns the slug to study next, or null if nothing's reasonable to pick.
 */
export function pickNextStudySlug(
  ledger: StudyLedgerFile,
  availableSlugs: string[],
  today: string
): string | null {
  if (availableSlugs.length === 0) return null;
  const entryMap = new Map(ledger.entries.map((e) => [e.slug, e]));

  // 1. Open attempt.
  for (const slug of availableSlugs) {
    const e = entryMap.get(slug);
    if (e && e.attempts.length > 0 && e.attempts.at(-1)!.quality === undefined) return slug;
  }

  // 2. Never studied.
  for (const slug of availableSlugs) {
    if (!entryMap.has(slug)) return slug;
  }

  // 3. Due today or earlier.
  const dueToday = availableSlugs
    .map((s) => entryMap.get(s))
    .filter((e): e is StudyEntry => !!e && !!e.next_due && e.next_due <= today)
    .sort((a, b) => (a.next_due! < b.next_due! ? -1 : 1));
  if (dueToday.length > 0) return dueToday[0].slug;

  // 4. Soonest future-due.
  const future = availableSlugs
    .map((s) => entryMap.get(s))
    .filter((e): e is StudyEntry => !!e && !!e.next_due)
    .sort((a, b) => (a.next_due! < b.next_due! ? -1 : 1));
  if (future.length > 0) return future[0].slug;

  return null;
}
