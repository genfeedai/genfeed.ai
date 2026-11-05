const SKIN_TONE_MODIFIERS_PATTERN = /[\u{1F3FB}-\u{1F3FF}]/gu;
const ZERO_WIDTH_JOINERS_PATTERN = /\u200D/gu;
const VARIATION_SELECTORS_PATTERN = /[\uFE0E\uFE0F]/gu;
const TRAILING_LINE_WHITESPACE_PATTERN = /[ \t]+\n/g;
const REPEATED_SPACES_PATTERN = /[ \t]{2,}/g;
const EXCESS_BLANK_LINES_PATTERN = /\n{3,}/g;

const EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?)*)|(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:[#*0-9]\uFE0F?\u20E3)/gu;

export function sanitizeAgentOutputText(input: string): string {
  if (!input) {
    return input;
  }

  return input
    .replace(EMOJI_REGEX, '')
    .replace(SKIN_TONE_MODIFIERS_PATTERN, '')
    .replace(ZERO_WIDTH_JOINERS_PATTERN, '')
    .replace(VARIATION_SELECTORS_PATTERN, '')
    .replace(TRAILING_LINE_WHITESPACE_PATTERN, '\n')
    .replace(REPEATED_SPACES_PATTERN, ' ')
    .replace(EXCESS_BLANK_LINES_PATTERN, '\n\n')
    .trim();
}
