// Shared types for the drill-agent.

export type Tier = 1 | 2 | 3;

export interface Concept {
  slug: string;
  title: string;
  tier: Tier;
  lever: string;
  prerequisites: string[];
  tags: string[];
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
  drilled_at: string; // ISO date
  draft_path: string;
  status: 'draft' | 'merged' | 'rejected';
}

export interface LedgerFile {
  schema: string;
  description: string;
  drills: LedgerEntry[];
}
