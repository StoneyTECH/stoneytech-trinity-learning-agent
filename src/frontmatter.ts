// Frontmatter check for generated .svx drafts, run by drill.ts before a draft is written.
// It lives here rather than inline in drill.ts so it can be tested without a model call.

/**
 * Checks that a draft opens with a complete YAML frontmatter block (`---` ... `---`). If the
 * closing `---` is missing, inserts it where the body starts. Warns about anything it finds,
 * and returns the draft to write: repaired, or unchanged when it is complete or unrepairable.
 */
export function repairFrontmatter(draftText: string): string {
  const trimmed = draftText.trimStart();
  if (!trimmed.startsWith('---')) {
    console.warn('⚠ Draft does not begin with frontmatter delimiter. Manual review required.');
    return draftText;
  }
  // Look for a second --- that closes the frontmatter. The opening --- is at index 0
  // after trim, so search starts at index 3.
  const closingIdx = trimmed.indexOf('\n---', 3);
  if (closingIdx !== -1) return draftText;

  console.warn('⚠ Draft frontmatter is unterminated (no closing ---). Auto-repairing.');
  // The body starts at whichever comes first: the <script> block both draft prompts require right
  // after the closing ---, or a heading after a blank line. Closing the frontmatter at the first
  // heading instead would leave the <script> block inside the YAML.
  const bodyStart = trimmed.match(/\n\n?(?=<script\b)|\n\n(?=##? )/);
  if (bodyStart && bodyStart.index !== undefined) {
    const end = bodyStart.index + bodyStart[0].length;
    const atScript = trimmed.startsWith('<script', end);
    console.warn(`  → Inserted --- before ${atScript ? 'the <script> block' : 'first heading'}.`);
    // Splice in the closing --- in place of the newlines between the YAML and the body.
    return trimmed.slice(0, bodyStart.index) + '\n---\n\n' + trimmed.slice(end);
  }
  console.warn('  → Could not auto-repair (no clear body boundary). Draft will fail validation.');
  return draftText;
}
