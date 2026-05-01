// Picks the next undrilled concept. Strategy:
// 1. Filter concepts whose prerequisites have all been drilled (or are empty).
// 2. Filter out concepts already drilled (in the ledger with status != 'rejected').
// 3. Prefer tier 1 over tier 2 over tier 3.
// 4. Within a tier, pick the one with the lowest prerequisite count (i.e. closest to the spine).
// 5. If multiple tie, prefer the lever that hasn't been touched recently.

import { readFileSync } from 'fs';
import type { Concept, CurriculumFile, LedgerFile } from './types.ts';

export function loadCurriculum(path: string): CurriculumFile {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function loadLedger(path: string): LedgerFile {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function pickNextConcept(
  curriculum: CurriculumFile,
  ledger: LedgerFile
): Concept | null {
  const drilledSlugs = new Set(
    ledger.drills.filter((d) => d.status !== 'rejected').map((d) => d.slug)
  );

  const recentLevers = ledger.drills
    .slice(-5)
    .map((d) => curriculum.concepts.find((c) => c.slug === d.slug)?.lever)
    .filter((l): l is string => !!l);

  const eligible = curriculum.concepts.filter((c) => {
    if (drilledSlugs.has(c.slug)) return false;
    return c.prerequisites.every((p) => drilledSlugs.has(p));
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.prerequisites.length !== b.prerequisites.length)
      return a.prerequisites.length - b.prerequisites.length;
    const aRecent = recentLevers.indexOf(a.lever);
    const bRecent = recentLevers.indexOf(b.lever);
    // Higher index = more recent → push down. -1 (not in recent) → top.
    return aRecent - bRecent;
  });

  return eligible[0];
}
