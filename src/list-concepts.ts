// List concepts in the curriculum, marking which have been drilled.
// Run: npm run list

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadCurriculum, loadLedger } from './picker.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const curriculum = loadCurriculum(join(ROOT, 'curriculum/concepts.json'));
const ledger = loadLedger(process.env.DRILL_LEDGER || join(ROOT, 'curriculum/ledger.json'));

const drilledMap = new Map(ledger.drills.map((d) => [d.slug, d]));

console.log(`=== Curriculum: ${curriculum.concepts.length} concepts ===\n`);

const byLever: Record<string, typeof curriculum.concepts> = {};
for (const c of curriculum.concepts) {
  byLever[c.lever] = byLever[c.lever] || [];
  byLever[c.lever].push(c);
}

for (const lever of Object.keys(byLever)) {
  console.log(`[${lever}]`);
  for (const c of byLever[lever]) {
    const d = drilledMap.get(c.slug);
    const mark = d ? `✓ ${d.drilled_at}` : '·';
    const tier = c.tier === 1 ? 'T1' : c.tier === 2 ? 'T2' : 'T3';
    console.log(`  ${mark} [${tier}] ${c.slug} — ${c.title}`);
  }
  console.log('');
}

const drilledCount = ledger.drills.length;
const remaining = curriculum.concepts.length - drilledCount;
console.log(`Drilled: ${drilledCount} / ${curriculum.concepts.length} (${remaining} remaining)`);
