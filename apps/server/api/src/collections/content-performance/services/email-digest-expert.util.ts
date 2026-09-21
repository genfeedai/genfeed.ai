import { EXPERT_POSITIONING_DIMENSIONS } from '@genfeedai/contracts/constants';
import type { ExpertPositioningDimensionKey } from '@genfeedai/contracts/interfaces';

/**
 * Deterministic, no-LLM composition of the Expert Path weekly digest's
 * "What won" and "Record next" sections. Everything here is a pure function
 * of already-computed inputs (promoted winners, the top creative pattern,
 * and the brand's weakest positioning dimension) so the digest stays
 * reproducible and cheap to test.
 */

export interface ExpertDigestWinnerInput {
  content: string;
  platform?: string;
}

export interface ExpertDigestPatternInput {
  label?: string;
  description?: string;
  formula?: string;
}

export interface ExpertDigestPositioningDimension {
  label: string;
  followUpQuestion: string;
}

const NO_WINNERS_RECORD_NEXT_PROMPT =
  'No ideas were promoted this week. Add one piece of source material — a talk, newsletter, or call notes — so next week’s content has more of your thinking to work from.';

const GENERIC_RECORD_NEXT_PROMPT =
  'Record a 3-minute voice note that applies {pattern} to your positioning. Capture one story your audience hasn’t heard yet.';

/**
 * Maps a harness profile's `positioning.weakestDimension` key to the label +
 * follow-up question the digest prompts with. Returns null when the key is
 * missing or unrecognized (e.g. no positioning score has been computed yet).
 */
export function resolveWeakestPositioningDimension(
  weakestDimension: ExpertPositioningDimensionKey | undefined,
): ExpertDigestPositioningDimension | null {
  if (!weakestDimension) return null;
  const definition = EXPERT_POSITIONING_DIMENSIONS.find(
    (dimension) => dimension.key === weakestDimension,
  );
  return definition
    ? { followUpQuestion: definition.followUpQuestion, label: definition.label }
    : null;
}

/**
 * Plain-language description of the creative pattern behind this week's
 * winners. Prefers the extracted `CreativePattern` (description, then
 * formula, then label); falls back to a deterministic excerpt of the top
 * winner's opening line when no pattern has been extracted yet.
 */
export function derivePatternText(
  pattern: ExpertDigestPatternInput | null,
  topWinner: ExpertDigestWinnerInput | null,
): string | null {
  const fromPattern =
    pattern?.description?.trim() ||
    pattern?.formula?.trim() ||
    pattern?.label?.trim();
  if (fromPattern) return fromPattern;
  if (!topWinner) return null;

  const openingLine = extractOpeningLine(topWinner.content);
  const platformLabel = topWinner.platform
    ? `your ${topWinner.platform} opening`
    : 'your winning opening line';
  return openingLine ? `${platformLabel} — "${openingLine}"` : platformLabel;
}

function extractOpeningLine(content: string): string {
  const afterLabel = content.includes(':')
    ? content.split(':').slice(1).join(':')
    : content;
  const firstSentence = afterLabel.trim().split(/[.!?]/)[0]?.trim() ?? '';
  return firstSentence.slice(0, 120);
}

/**
 * Builds the single "Record next" prompt. Deterministic and LLM-free: it
 * only recombines the pattern text and weakest-dimension follow-up already
 * resolved by the caller.
 */
export function buildRecordNextPrompt(params: {
  hasWinners: boolean;
  patternText: string | null;
  weakestDimension: ExpertDigestPositioningDimension | null;
}): string {
  if (!params.hasWinners) return NO_WINNERS_RECORD_NEXT_PROMPT;

  const pattern = params.patternText ?? 'your winning pattern';
  if (params.weakestDimension) {
    return `Record a 3-minute voice note that applies ${pattern} to ${params.weakestDimension.label.toLowerCase()}: ${params.weakestDimension.followUpQuestion}`;
  }
  return GENERIC_RECORD_NEXT_PROMPT.replace('{pattern}', pattern);
}
