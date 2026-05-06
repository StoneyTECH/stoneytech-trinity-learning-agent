// Picks the next undrilled concept for a given register. Strategy:
// 1. Filter concepts that match the requested register (architect | primer; 'both' matches either).
// 2. Filter concepts whose prerequisites have all been drilled in the same register (or are empty).
// 3. Filter out concepts already drilled in this register (status != 'rejected').
// 4. Prefer tier 1 over tier 2 over tier 3.
// 5. Within a tier, pick the one with the lowest prerequisite count (i.e. closest to the spine).
// 6. If multiple tie, prefer the lever that hasn't been touched recently in this register.

import { readFileSync } from 'fs';
import type { Concept, CurriculumFile, LedgerFile, RegisterFilter } from './types.ts';
import { conceptMatchesRegister } from './types.ts';

export function loadCurriculum(path: string): CurriculumFile {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function loadLedger(path: string): LedgerFile {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function pickNextConcept(
  curriculum: CurriculumFile,
  ledger: LedgerFile,
  register: RegisterFilter = 'architect'
): Concept | null {
  // Drilled in THIS register specifically. Concepts drilled in the other
  // register can still be picked here (different output, same source concept).
  const drilledInThisRegister = new Set(
    ledger.drills
      .filter((d) => (d.register || 'architect') === register)
      .filter((d) => d.status !== 'rejected')
      .map((d) => d.slug)
  );

  const recentLevers = ledger.drills
    .filter((d) => (d.register || 'architect') === register)
    .slice(-5)
    .map((d) => curriculum.concepts.find((c) => c.slug === d.slug)?.lever)
    .filter((l): l is string => !!l);

  const eligible = curriculum.concepts.filter((c) => {
    if (!conceptMatchesRegister(c, register)) return false;
    if (drilledInThisRegister.has(c.slug)) return false;
    return c.prerequisites.every((p) => drilledInThisRegister.has(p));
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
