// Main daily-run entry point. Picks the next undrilled concept (filtered by
// register), generates a register-appropriate .svx draft via Claude Opus 4.7,
// writes it to the right drafts directory, and appends an entry to the ledger.
//
// Run: npm run drill                                    (architect register, default)
//      REGISTER=primer npm run drill                    (Demystify AI register)
//      DRY_RUN=1 npm run drill                          (no draft write, no ledger append)
//      DRY_RUN=1 SKIP_API=1 npm run drill               (no API call either)
//      CONCEPT=<slug> npm run drill                     (force a specific concept)

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadCurriculum, loadLedger, pickNextConcept } from './picker.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt-template.ts';
import { PRIMER_SYSTEM_PROMPT, buildPrimerUserPrompt } from './prompt-template-primer.ts';
import { notifyTelegram } from './notify-telegram.ts';
import type { Concept, LedgerEntry, RegisterFilter } from './types.ts';
import { conceptMatchesRegister } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Register: 'architect' (default, Determinism Ladder voice) or 'primer' (Demystify AI voice).
const REGISTER: RegisterFilter =
  process.env.REGISTER === 'primer' ? 'primer' : 'architect';
const IS_PRIMER = REGISTER === 'primer';

const DRY_RUN_NO_API = process.env.DRY_RUN === '1' && process.env.SKIP_API === '1';
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !DRY_RUN_NO_API) {
  console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and fill it in.');
  console.error('(Or run with DRY_RUN=1 SKIP_API=1 to test the picker + prompt assembly without an API call.)');
  process.exit(1);
}

// Drafts dir defaults are register-aware and stay inside the repo by default.
//   architect → ./output/drafts/architect
//   primer    → ./output/drafts/primer
// Override either with DRAFTS_DIR when embedding this pattern in a larger app.
const DEFAULT_LOCAL_DRAFTS_DIR = IS_PRIMER
  ? join(ROOT, 'output/drafts/primer')
  : join(ROOT, 'output/drafts/architect');
const DRAFTS_DIR = process.env.DRAFTS_DIR || DEFAULT_LOCAL_DRAFTS_DIR;

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
  if (!conceptMatchesRegister(concept, REGISTER)) {
    console.error(
      `Concept ${concept.slug} has register='${concept.register || 'architect'}' which doesn't match REGISTER='${REGISTER}'. ` +
        `Either pick a different concept, switch REGISTER, or update the concept's register field in concepts.json.`
    );
    process.exit(1);
  }
  console.log(`[forced] Drilling concept: ${concept.slug} (register: ${REGISTER})`);
} else {
  concept = pickNextConcept(curriculum, ledger, REGISTER);
  if (!concept) {
    console.error(
      `No undrilled concepts remain for register='${REGISTER}'. Add more in concepts.json (with register: '${REGISTER}' or 'both').`
    );
    process.exit(0);
  }
  console.log(`[picked] Drilling concept: ${concept.slug} — ${concept.title}`);
  console.log(`  register: ${REGISTER}`);
}

console.log(`  tier: ${concept.tier}`);
console.log(`  lever: ${concept.lever}`);
console.log(`  anchor axiom: #${concept.anchor_axiom}`);
console.log(`  prerequisites: ${concept.prerequisites.length || 'none'}`);
console.log('');

const systemPrompt = IS_PRIMER ? PRIMER_SYSTEM_PROMPT : SYSTEM_PROMPT;
const userPrompt = IS_PRIMER ? buildPrimerUserPrompt(concept, today) : buildUserPrompt(concept, today);

if (DRY_RUN_NO_API) {
  console.log(`[dry-run, skip-api] Picker + prompt assembly verified (register: ${REGISTER}). Stopping before API call.`);
  console.log('');
  console.log('--- USER PROMPT PREVIEW ---');
  console.log(userPrompt);
  process.exit(0);
}

console.log(`Calling Opus 4.7 for ${REGISTER}-register draft generation...`);
// Upgrade seam:
// - map the draft role through agents/graph-map.json when provider routing
//   should choose local, vendor, or OpenRouter paths
// - add shadow draft judges from shadow/tribunal-config.example.json when
//   draft quality should be compared without blocking the primary loop

const client = new Anthropic({ apiKey: apiKey! });
const startTime = Date.now();

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 8000,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }]
});

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

let draftText = response.content
  .filter((b) => b.type === 'text')
  .map((b) => (b.type === 'text' ? b.text : ''))
  .join('\n');

console.log(`✓ Draft generated in ${elapsedSec}s.`);
console.log(`  tokens — in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`);
console.log(`  stop reason: ${response.stop_reason}`);
console.log(`  draft length: ${draftText.length} chars`);
console.log('');

// Sanity check — the draft should have a complete frontmatter block (open + close).
// Caught a real bug 2026-05-03 where Opus 4.7 omitted the closing ---, breaking the
// site's build-time verification validator. Auto-repair if we can; warn loudly if not.
const trimmed = draftText.trimStart();
if (!trimmed.startsWith('---')) {
  console.warn('⚠ Draft does not begin with frontmatter delimiter. Manual review required.');
} else {
  // Look for a second --- that closes the frontmatter. The opening --- is at index 0
  // after trim, so search starts at index 3.
  const closingIdx = trimmed.indexOf('\n---', 3);
  if (closingIdx === -1) {
    console.warn('⚠ Draft frontmatter is unterminated (no closing ---). Auto-repairing.');
    // Find the first heading or first blank-line-followed-by-heading and inject --- before it.
    const headingMatch = trimmed.match(/\n\n(##? )/);
    if (headingMatch && headingMatch.index !== undefined) {
      // Splice in the closing --- between the YAML and the heading.
      draftText =
        trimmed.slice(0, headingMatch.index) +
        '\n---\n\n' +
        trimmed.slice(headingMatch.index + 2); // strip the leading \n\n we already replaced
      console.warn('  → Inserted --- before first heading.');
    } else {
      console.warn('  → Could not auto-repair (no clear body boundary). Draft will fail validation.');
    }
  }
}

const filename = IS_PRIMER
  ? `daily-primer-${today}-${concept.slug}.svx`
  : `daily-drill-${today}-${concept.slug}.svx`;

if (DRY_RUN) {
  console.log('[dry-run] Would write draft to:');
  console.log(`  ${join(DRAFTS_DIR, filename)}`);
  console.log('[dry-run] Would append ledger entry for slug:', concept.slug, '(register:', REGISTER + ')');
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
  register: REGISTER,
  drilled_at: today,
  draft_path: draftPath,
  status: 'draft'
};
const updatedLedger = { ...ledger, drills: [...ledger.drills, entry] };
writeFileSync(LEDGER_PATH, JSON.stringify(updatedLedger, null, 2) + '\n', 'utf-8');
console.log(`✓ Ledger updated: ${LEDGER_PATH}`);

// Telegram digest. Skipped if NOTIFY=0 (e.g. in tests). Failures are non-blocking.
if (process.env.NOTIFY !== '0') {
  // n8n seam:
  // replace direct bridge delivery with a webhook or queue handoff when this
  // loop graduates into a larger orchestration surface.
  // Try to extract the excerpt from the generated frontmatter for a richer digest.
  const excerptMatch = draftText.match(/excerpt:\s*([^\n]+)/);
  const excerpt = excerptMatch ? excerptMatch[1].replace(/^["']|["']$/g, '').trim() : '';

  // GitHub link if we know the repo URL (set by CI).
  const ghRepo = process.env.GITHUB_REPOSITORY;
  const ghBranch = process.env.GITHUB_REF_NAME || 'main';
  const draftRel = draftPath.includes('/output/drafts/')
    ? draftPath.slice(draftPath.indexOf('output/drafts/'))
    : (IS_PRIMER ? `output/drafts/primer/${filename}` : `output/drafts/architect/${filename}`);
  const ghLink = ghRepo
    ? `https://github.com/${ghRepo}/blob/${ghBranch}/${draftRel}`
    : null;

  const seriesEmoji = IS_PRIMER ? '📚' : '🪛';
  const seriesLabel = IS_PRIMER ? 'Daily primer' : 'Daily drill';
  const seriesPath = IS_PRIMER ? '/demystify' : '/learn';

  const lines = [
    `${seriesEmoji} <b>${seriesLabel} — ${today}</b>`,
    ``,
    `<b>Series:</b> ${IS_PRIMER ? 'Demystify AI' : 'Determinism Ladder'} (<a href="https://stoneytech.net${seriesPath}">${seriesPath}</a>)`,
    `<b>Concept:</b> ${concept.title}`,
    `<b>Lever:</b> ${concept.lever} · <b>Tier:</b> ${concept.tier} · <b>Anchor:</b> axiom #${concept.anchor_axiom}`,
    excerpt ? `\n<i>${excerpt}</i>` : ``,
    ``,
    `<b>Stats:</b> ${response.usage.input_tokens} in / ${response.usage.output_tokens} out · ${elapsedSec}s · ${draftText.length} chars`,
    ``,
    ghLink ? `<a href="${ghLink}">📄 View draft on GitHub</a>` : `📄 ${draftPath}`
  ];
  await notifyTelegram({ message: lines.filter(Boolean).join('\n') });
}

console.log('');
console.log('Next step: review the draft, refine it, then hand it to the next verification or publication stage.');
