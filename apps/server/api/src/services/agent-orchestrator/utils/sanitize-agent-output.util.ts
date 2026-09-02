const EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?)*)|(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:[#*0-9]\uFE0F?\u20E3)/gu;

export function sanitizeAgentOutputText(input: string): string {
  if (!input) {
    return input;
  }

  return input
    .replace(EMOJI_REGEX, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\u200D/gu, '')
    .replace(/[\uFE0E\uFE0F]/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
