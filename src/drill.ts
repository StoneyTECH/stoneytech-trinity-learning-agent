// Main daily-run entry point. Picks the next undrilled concept, generates a
// multi-level .svx draft via Claude Opus 4.7, writes it to
// stoneytech-site/src/posts/learn/_drafts/, and appends an entry to the ledger.
//
// Run: npm run drill              (writes to default DRAFTS_DIR + DRILL_LEDGER)
//      DRY_RUN=1 npm run drill    (no draft write, no ledger append; prints to stdout)
//      CONCEPT=<slug> npm run drill  (force a specific concept)

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { loadCurriculum, loadLedger, pickNextConcept } from './picker.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt-template.ts';
import type { Concept, LedgerEntry } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DRY_RUN_NO_API = process.env.DRY_RUN === '1' && process.env.SKIP_API === '1';
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !DRY_RUN_NO_API) {
  console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and fill it in.');
  console.error('(Or run with DRY_RUN=1 SKIP_API=1 to test the picker + prompt assembly without an API call.)');
  process.exit(1);
}

const DRAFTS_DIR =
  process.env.DRAFTS_DIR ||
  join(homedir(), 'JobSearch/stoneytech-site/src/posts/learn/_drafts');
const LEDGER_PATH = process.env.DRILL_LEDGER || join(ROOT, 'curriculum/ledger.json');
const CURRICULUM_PATH = join(ROOT, 'curriculum/concepts.json');
const FORCE_CONCEPT = process.env.CONCEPT;
const DRY_RUN = process.env.DRY_RUN === '1';

const today = new Date().toISOString().slice(0, 10);

const curriculum = loadCurriculum(CURRICULUM_PATH);
const ledger = loadLedger(LEDGER_PATH);

let concept: Concept | null;
if (FORCE_CONCEPT) {
  concept = curriculum.concepts.find((c) => c.slug === FORCE_CONCEPT) || null;
  if (!concept) {
    console.error(`Concept slug not found: ${FORCE_CONCEPT}`);
    console.error(`Run 'npm run list' to see available concepts.`);
    process.exit(1);
  }
  console.log(`[forced] Drilling concept: ${concept.slug}`);
} else {
  concept = pickNextConcept(curriculum, ledger);
  if (!concept) {
    console.error('No undrilled concepts remain. Curriculum exhausted — author more in concepts.json.');
    process.exit(0);
  }
  console.log(`[picked] Drilling concept: ${concept.slug} — ${concept.title}`);
}

console.log(`  tier: ${concept.tier}`);
console.log(`  lever: ${concept.lever}`);
console.log(`  anchor axiom: #${concept.anchor_axiom}`);
console.log(`  prerequisites: ${concept.prerequisites.length || 'none'}`);
console.log('');
if (DRY_RUN_NO_API) {
  console.log('[dry-run, skip-api] Picker + prompt assembly verified. Stopping before API call.');
  console.log('');
  console.log('--- USER PROMPT PREVIEW ---');
  console.log(buildUserPrompt(concept, today));
  process.exit(0);
}

console.log('Calling Opus 4.7 for draft generation...');

const client = new Anthropic({ apiKey: apiKey! });
const startTime = Date.now();

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 8000,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildUserPrompt(concept, today) }]
});

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

const draftText = response.content
  .filter((b) => b.type === 'text')
  .map((b) => (b.type === 'text' ? b.text : ''))
  .join('\n');

console.log(`✓ Draft generated in ${elapsedSec}s.`);
console.log(`  tokens — in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`);
console.log(`  stop reason: ${response.stop_reason}`);
console.log(`  draft length: ${draftText.length} chars`);
console.log('');

// Sanity check — the draft should start with --- (frontmatter).
if (!draftText.trim().startsWith('---')) {
  console.warn('⚠ Draft does not begin with frontmatter delimiter. Manual review required.');
}

const filename = `daily-drill-${today}-${concept.slug}.svx`;

if (DRY_RUN) {
  console.log('[dry-run] Would write draft to:');
  console.log(`  ${join(DRAFTS_DIR, filename)}`);
  console.log('[dry-run] Would append ledger entry for slug:', concept.slug);
  console.log('');
  console.log('--- DRAFT PREVIEW ---');
  console.log(draftText.slice(0, 800));
  if (draftText.length > 800) console.log(`... (${draftText.length - 800} more chars)`);
  process.exit(0);
}

if (!existsSync(DRAFTS_DIR)) {
  console.log(`Creating drafts dir: ${DRAFTS_DIR}`);
  mkdirSync(DRAFTS_DIR, { recursive: true });
}

const draftPath = join(DRAFTS_DIR, filename);
writeFileSync(draftPath, draftText, 'utf-8');
console.log(`✓ Draft written: ${draftPath}`);

// Append to ledger.
const entry: LedgerEntry = {
  slug: concept.slug,
  drilled_at: today,
  draft_path: draftPath,
  status: 'draft'
};
const updatedLedger = { ...ledger, drills: [...ledger.drills, entry] };
writeFileSync(LEDGER_PATH, JSON.stringify(updatedLedger, null, 2) + '\n', 'utf-8');
console.log(`✓ Ledger updated: ${LEDGER_PATH}`);

console.log('');
console.log('Next step: review the draft, refine, then move to src/posts/learn/ and run the GVAR v3.3 panel via webhook.');
