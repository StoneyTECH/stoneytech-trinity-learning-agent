import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

type DemoMode = 'draft' | 'gold';

interface EvidenceBrief {
  subject: string;
  primary_source_url: string;
  bounded_claim: string;
  evidence_summary: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv: string[]) {
  const args = { mode: 'draft' as DemoMode, briefFile: '', output: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--mode') args.mode = (argv[++i] as DemoMode) || 'draft';
    else if (token === '--brief-file') args.briefFile = argv[++i] || '';
    else if (token === '--output') args.output = argv[++i] || '';
    else if (token === '--json') args.json = true;
  }
  return args;
}

function loadBrief(pathValue: string): EvidenceBrief {
  if (!pathValue) {
    return {
      subject: 'portable agent pattern kits',
      primary_source_url: 'https://example.com/portable-agent-pattern-kits',
      bounded_claim:
        'Portable agent pattern kits stay useful when the job shape, MCP surface, and upgrade seams are named before provider choice.',
      evidence_summary:
        'A local graph, a bounded MCP, and a stable template let the runtime grow without changing the pattern.'
    };
  }
  return JSON.parse(readFileSync(resolve(pathValue), 'utf8')) as EvidenceBrief;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'portable-agent-pattern-kits';
}

function buildBody(brief: EvidenceBrief, mode: DemoMode): string {
  const lines = [
    '# Portable pattern kit',
    '',
    `Subject: ${brief.subject}`,
    '',
    `${brief.bounded_claim}`,
    '',
    `Primary source: ${brief.primary_source_url}`,
    '',
    `${brief.evidence_summary}`,
    '',
    'A small loop still wins when the artifact, handoff, and exit rule stay obvious.',
    '',
    'Deployment context belongs early in the decision, before provider fashion or orchestration appetite starts steering the design.'
  ];

  if (mode === 'gold') {
    lines.push(
      '',
      '## Threat surface',
      '',
      'Name the threat surface for every lever.',
      '',
      '## Security controls',
      '',
      'Bound the workflow with explicit audit controls before autonomy expands.',
      '',
      '## Context matrix',
      '',
      'Map cloud, private cloud, and on-prem paths before choosing tools.',
      '',
      '## Exit rule',
      '',
      'Stop when the path is bounded and auditable.'
    );
  } else {
    lines.push(
      '',
      'Threat surface review belongs early in the workflow.',
      '',
      'A compact context matrix belongs near the start of the work.'
    );
  }

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const brief = loadBrief(args.briefFile);
  const body = buildBody(brief, args.mode);
  const suggestedName = `${args.mode}-${slugify(brief.subject)}.md`;
  let outputPath = '';

  if (args.output) {
    outputPath = resolve(args.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, body, 'utf8');
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          subject: brief.subject,
          output_path: outputPath || null,
          suggested_name: suggestedName
        },
        null,
        2
      )
    );
    return;
  }

  console.log(body);
}

main();
