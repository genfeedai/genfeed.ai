/**
 * The media brief for a cadence draft: the opportunity topic and, once the
 * agent has written it, the post's own caption. Brand identity is applied by
 * the generation endpoint's brand enhancement, never restated here.
 */
export function buildCadenceMediaPrompt(
  topic: string,
  caption?: string,
): string {
  const copy = caption?.trim();
  return copy
    ? `Visual for a social post about: ${topic.trim()}\n\nPost copy:\n${copy}`
    : `Visual for a social post about: ${topic.trim()}`;
}
