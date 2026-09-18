export interface ExtractedSkillRequest {
  /** The prompt with its leading skill tokens removed. */
  content: string;
  /** Slugs picked from the `/` palette, in the order they were typed. */
  skillSlugs: string[];
}

const LEADING_COMMAND_RE = /^\/([a-z0-9][a-z0-9-]*)\s*/i;

/**
 * Pull `/skill-slug` tokens off the front of a composer prompt.
 *
 * The palette inserts the picked skill as literal text rather than hidden
 * state, so what the operator sees is what the turn sends: deleting the token
 * un-picks the skill, with nothing to keep in sync. Only slugs the palette
 * actually offered are recognised, so a message that happens to start with a
 * slash is left alone.
 */
export function extractRequestedSkillSlugs(
  prompt: string,
  knownSlugs: readonly string[],
): ExtractedSkillRequest {
  const available = new Set(knownSlugs);
  const skillSlugs: string[] = [];
  let content = prompt.trimStart();

  while (content.length > 0) {
    const match = content.match(LEADING_COMMAND_RE);
    const slug = match?.[1]?.toLowerCase();

    if (!match || !slug || !available.has(slug)) {
      break;
    }

    if (!skillSlugs.includes(slug)) {
      skillSlugs.push(slug);
    }
    content = content.slice(match[0].length);
  }

  return { content: content.trim(), skillSlugs };
}
