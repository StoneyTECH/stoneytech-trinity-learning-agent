// Study entry point. Picks next concept due for SR, generates a Q+A pair via
// Opus 4.7, sends an optional notification with the question + canonical answer
// (collapsed below a separator), records an open attempt in the study ledger.
//
// Stoney later runs `npm run grade <slug> <0..5>` to log the self-assessed
// quality of recall, which schedules the next review via SM-2.
//
// Run: npm run study
//   DRY_RUN=1                 — no API call, no ledger write
//   CONCEPT=<slug>            — force a specific concept
//   NOTIFY=0                  — skip bridge delivery

import Anthropic from '@anthropic-ai/sdk';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadCurriculum } from './picker.ts';
import {
  loadStudyLedger,
  saveStudyLedger,
  getOrCreateEntry,
  pickNextStudySlug
} from './study-ledger.ts';
import { STUDY_SYSTEM_PROMPT, buildStudyUserPrompt } from './study-prompt.ts';
import { notifyBridge } from './notify-bridge.ts';
import type { Concept } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CURRICULUM_PATH = join(ROOT, 'curriculum/concepts.json');
const STUDY_LEDGER_PATH = process.env.STUDY_LEDGER || join(ROOT, 'curriculum/study-ledger.json');

const FORCE_CONCEPT = process.env.CONCEPT;
const DRY_RUN = process.env.DRY_RUN === '1';
const NOTIFY = process.env.NOTIFY !== '0';

const today = new Date().toISOString().slice(0, 10);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !DRY_RUN) {
  console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const curriculum = loadCurriculum(CURRICULUM_PATH);
const ledger = loadStudyLedger(STUDY_LEDGER_PATH);

let concept: Concept | undefined;
if (FORCE_CONCEPT) {
  concept = curriculum.concepts.find((c) => c.slug === FORCE_CONCEPT);
  if (!concept) {
    console.error(`Concept slug not found: ${FORCE_CONCEPT}`);
    process.exit(1);
  }
} else {
  const slug = pickNextStudySlug(
    ledger,
    curriculum.concepts.map((c) => c.slug),
    today
  );
  if (!slug) {
    console.error('No concepts available to study.');
    process.exit(0);
  }
  concept = curriculum.concepts.find((c) => c.slug === slug);
  if (!concept) {
    console.error(`Internal error: picker returned slug ${slug} but it's not in curriculum.`);
    process.exit(1);
  }
}

console.log(`[picked] Studying: ${concept.slug} — ${concept.title}`);
const entry = getOrCreateEntry(ledger, concept.slug);
console.log(
  `  SR state: ease ${entry.ease_factor} · interval ${entry.interval}d · reps ${entry.repetitions}` +
    (entry.next_due ? ` · was due ${entry.next_due}` : ' · never studied')
);

if (DRY_RUN) {
  console.log('[dry-run] Would call Opus 4.7 for Q+A generation.');
  console.log('[dry-run] Would send notification digest.');
  console.log('[dry-run] Would record open attempt in study-ledger.');
  process.exit(0);
}

console.log('Calling Opus 4.7 for Q+A generation...');
// Upgrade seam:
// - route this study role through agents/graph-map.json when provider selection
//   should be job-specific
// - run silent shadow graders or question reviewers from
//   shadow/tribunal-config.example.json when recall quality needs a tribunal
const client = new Anthropic({ apiKey: apiKey! });
const startTime = Date.now();

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 1500,
  system: STUDY_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildStudyUserPrompt(concept) }]
});

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
const rawText = response.content
  .filter((b) => b.type === 'text')
  .map((b) => (b.type === 'text' ? b.text : ''))
  .join('\n');

// Tolerant JSON extraction — Opus is well-behaved but sometimes wraps in code fences.
let parsed: { question?: string; canonical_answer?: string } | null = null;
try {
  parsed = JSON.parse(rawText);
} catch {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(rawText.slice(start, end + 1));
    } catch {}
  }
}
if (!parsed?.question || !parsed?.canonical_answer) {
  console.error('Failed to parse Opus output as {question, canonical_answer}.');
  console.error('Raw output (first 500 chars):', rawText.slice(0, 500));
  process.exit(1);
}

console.log(`✓ Generated in ${elapsedSec}s.`);
console.log(`  tokens — in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`);
console.log('');

// Append the open attempt to the ledger.
entry.attempts.push({
  attempted_at: today,
  question: parsed.question,
  canonical_answer: parsed.canonical_answer
});
saveStudyLedger(STUDY_LEDGER_PATH, ledger);
console.log(`✓ Open attempt recorded in ${STUDY_LEDGER_PATH}`);

// Notification digest. Question on top, separator, canonical below.
if (NOTIFY) {
  // n8n seam:
  // replace direct bridge delivery with a webhook or approval flow when a
  // larger workflow runtime should own notifications and follow-up actions.
  const lines = [
    `📚 <b>Daily study — ${today}</b>`,
    ``,
    `<b>Concept:</b> ${concept.title}`,
    `<b>Lever:</b> ${concept.lever} · <b>Tier:</b> ${concept.tier} · <b>Anchor:</b> axiom #${concept.anchor_axiom}`,
    ``,
    `<b>❓ Question</b>`,
    parsed.question,
    ``,
    `──── attempt your answer mentally first ────`,
    ``,
    `<b>✅ Canonical answer</b>`,
    parsed.canonical_answer,
    ``,
    `<b>Grade yourself when ready:</b>`,
    `<code>npm run grade ${concept.slug} 0</code> — blanked`,
    `<code>npm run grade ${concept.slug} 3</code> — recalled with effort`,
    `<code>npm run grade ${concept.slug} 5</code> — instant + complete`
  ];
  const ok = await notifyBridge({ message: lines.join('\n') });
  console.log(ok ? '✓ Notification digest sent.' : '⚠ Notification digest failed (non-blocking).');
}

console.log('');
console.log(`Next: attempt mentally, then run \`npm run grade ${concept.slug} <0-5>\` to schedule the next review.`);
