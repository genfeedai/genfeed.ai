export const FILMMAKING_LEXICON_SLUG =
  'how-to-prompt-ai-images-videos-and-audio';

/**
 * Whether an article carries an interactive lab. Checked before the lab's
 * module is imported, so every other article skips its code (and the Radix
 * slider it uses) entirely.
 */
export function hasArticleExperience(slug?: string): boolean {
  return slug === FILMMAKING_LEXICON_SLUG;
}
