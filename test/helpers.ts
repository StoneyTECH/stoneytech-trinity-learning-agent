// Shared test helpers. Not a test file itself (no .test.ts suffix).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Same on-disk format the scripts write: 2-space JSON plus a trailing newline. */
export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** A fresh temp directory, removed when the test finishes. */
export function sandbox(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'learning-agent-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Today as the scripts compute it: the UTC calendar date. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const REAL_DATA = ['curriculum/concepts.json', 'curriculum/ledger.json', 'curriculum/study-ledger.json'];

/**
 * Snapshot the committed curriculum files. Pass the result to `after()` in any test file
 * that runs a script able to write, so a test that leaks onto the real ledgers fails loudly.
 */
export function guardRealData(): () => void {
  const before = REAL_DATA.map((rel) => readFileSync(join(REPO_ROOT, rel), 'utf8'));
  return () => {
    REAL_DATA.forEach((rel, i) => {
      assert.equal(readFileSync(join(REPO_ROOT, rel), 'utf8'), before[i], `${rel} was modified by a test`);
    });
  };
}

// Every env knob the scripts read. Child processes never inherit these from the developer's shell.
const SCRIPT_ENV = [
  'ANTHROPIC_API_KEY',
  'CONCEPT',
  'DRAFTS_DIR',
  'DRILL_LEDGER',
  'DRY_RUN',
  'GITHUB_REF_NAME',
  'GITHUB_REPOSITORY',
  'NOTIFY',
  'REGISTER',
  'SKIP_API',
  'STUDY_LEDGER',
  'TELEGRAM_BRIDGE_URL',
  'TELEGRAM_CHAT_ID'
];

// Preloaded into every child: any fetch() rejects instead of reaching the network.
const NO_NETWORK =
  "data:text/javascript,globalThis.fetch=()=>Promise.reject(new Error('network disabled in tests'))";

export interface ScriptRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run a repo script (e.g. 'src/grade.ts') the way `npm run` would, but offline and sandboxed:
 * no API key, notifications off, fetch disabled, and every ledger/draft path pointed into `dir`.
 * `env` overrides those defaults; an `undefined` value removes the variable.
 */
export function runScript(
  script: string,
  args: string[],
  dir: string,
  env: Record<string, string | undefined> = {}
): ScriptRun {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of SCRIPT_ENV) delete childEnv[key];
  Object.assign(
    childEnv,
    {
      NOTIFY: '0',
      DRILL_LEDGER: join(dir, 'ledger.json'),
      STUDY_LEDGER: join(dir, 'study-ledger.json'),
      DRAFTS_DIR: join(dir, 'drafts')
    },
    env
  );
  for (const [key, value] of Object.entries(childEnv)) if (value === undefined) delete childEnv[key];

  const result = spawnSync(process.execPath, ['--import', NO_NETWORK, '--import', 'tsx', script, ...args], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: 'utf8',
    timeout: 30_000
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
