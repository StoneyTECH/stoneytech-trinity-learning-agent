// Self-grade CLI for the study agent.
//
// Run: npm run grade <slug> <0..5> [optional notes...]
//
// Logs the quality grade against the most recent open attempt for <slug>,
// computes the next SM-2 schedule, updates the ledger, and pings Telegram
// with the next-due date.

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadStudyLedger, saveStudyLedger, getOrCreateEntry } from './study-ledger.ts';
import { nextSm2 } from './sm2.ts';
import type { Quality } from './sm2.ts';
import { notifyTelegram } from './notify-telegram.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STUDY_LEDGER_PATH = process.env.STUDY_LEDGER || join(ROOT, 'curriculum/study-ledger.json');
const NOTIFY = process.env.NOTIFY !== '0';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npm run grade <slug> <0..5> [optional notes]');
  process.exit(1);
}

const slug = args[0];
const qualityNum = parseInt(args[1], 10);
const notes = args.slice(2).join(' ').trim() || undefined;

if (!Number.isInteger(qualityNum) || qualityNum < 0 || qualityNum > 5) {
  console.error('Quality must be an integer 0-5.');
  console.error('  0 — total blank');
  console.error('  1 — wrong, the right answer felt new');
  console.error('  2 — wrong, the right answer felt familiar');
  console.error('  3 — recalled with significant effort (would have failed without hint)');
  console.error('  4 — recalled with hesitation');
  console.error('  5 — instant, complete recall');
  process.exit(1);
}
const quality = qualityNum as Quality;

const ledger = loadStudyLedger(STUDY_LEDGER_PATH);
const entry = getOrCreateEntry(ledger, slug);

if (entry.attempts.length === 0) {
  console.error(`No attempts logged for ${slug}. Run \`npm run study\` first to generate a Q+A.`);
  process.exit(1);
}

const lastAttempt = entry.attempts.at(-1)!;
if (lastAttempt.quality !== undefined) {
  console.error(
    `Most recent attempt for ${slug} already graded (${lastAttempt.quality}/5 on ${lastAttempt.graded_at}). ` +
      `Run \`npm run study\` to generate a new attempt before grading again.`
  );
  process.exit(1);
}

const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

// Compute next SM-2 state from the prior state.
const next = nextSm2(
  { ease_factor: entry.ease_factor, interval: entry.interval, repetitions: entry.repetitions },
  quality,
  today
);

// Update the entry.
lastAttempt.quality = quality;
lastAttempt.graded_at = todayISO;
if (notes) lastAttempt.notes = notes;
entry.ease_factor = next.ease_factor;
entry.interval = next.interval;
entry.repetitions = next.repetitions;
entry.last_studied = todayISO;
entry.next_due = next.next_due;

saveStudyLedger(STUDY_LEDGER_PATH, ledger);

console.log(`✓ Graded ${slug}: ${quality}/5`);
console.log(`  ease ${next.ease_factor} · interval ${next.interval}d · reps ${next.repetitions}`);
console.log(`  next due: ${next.next_due}`);
if (notes) console.log(`  notes: ${notes}`);

// Telegram digest with the result + next due. Useful for tracking on the phone.
if (NOTIFY) {
  const grade =
    quality === 5
      ? '🟢 5/5 — instant + complete'
      : quality === 4
      ? '🟢 4/5 — recall with hesitation'
      : quality === 3
      ? '🟡 3/5 — recall with effort'
      : quality === 2
      ? '🔴 2/5 — wrong, familiar'
      : quality === 1
      ? '🔴 1/5 — wrong, new'
      : '⚫ 0/5 — total blank';

  const lines = [
    `📊 <b>Graded — ${slug}</b>`,
    ``,
    grade,
    ``,
    `<b>SR state:</b> ease ${next.ease_factor} · interval ${next.interval}d · reps ${next.repetitions}`,
    `<b>Next due:</b> ${next.next_due}`
  ];
  if (notes) lines.push(``, `<i>Notes: ${notes}</i>`);
  await notifyTelegram({ message: lines.join('\n') });
}
