// Shared types for the learning-agent.

export type Tier = 1 | 2 | 3;

/**
 * Output register for a concept's draft:
 * - 'architect' → Determinism Ladder voice (~2000 words, war-story-anchored, opinionated)
 * - 'primer'    → Demystify AI voice (~1300 words, audience-anecdote-anchored, friendly)
 * - 'both'      → concept works in either register; pick mode at run time
 */
export type Register = 'architect' | 'primer' | 'both';

/** Filter passed to the picker at run time. 'both' is not a valid filter — use 'architect' or 'primer'. */
export type RegisterFilter = 'architect' | 'primer';

export interface Concept {
  slug: string;
  title: string;
  tier: Tier;
  /** Defaults to 'architect' for backwards compatibility if missing on older curriculum entries. */
  register?: Register;
  lever: string;
  prerequisites: string[];
  tags: string[];
  /** The audience-anecdote / war-story seed the prompt template uses to dramatize the lesson. */
  war_story_hint: string;
  anchor_axiom: number;
}

export interface CurriculumFile {
  schema: string;
  description: string;
  concepts: Concept[];
}

export interface LedgerEntry {
  slug: string;
  /** Defaults to 'architect' for backwards compatibility on v1 ledgers. */
  register?: RegisterFilter;
  drilled_at: string; // ISO date
  draft_path: string;
  status: 'draft' | 'merged' | 'rejected';
  note?: string;
}

export interface LedgerFile {
  schema: string;
  description: string;
  drills: LedgerEntry[];
}

/** Whether a concept's `register` field includes the requested filter. Treats 'both' as matching everything. */
export function conceptMatchesRegister(c: Concept, filter: RegisterFilter): boolean {
  const r = c.register || 'architect';
  return r === filter || r === 'both';
}
