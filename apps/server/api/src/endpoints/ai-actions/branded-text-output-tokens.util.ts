import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';

const MAX_OUTPUT_TOKENS = 32000;
/** Rough characters per token, to size the answer a provider may give. */
const CHARACTERS_PER_TOKEN = 2;

/** Output tokens a provider may spend on an answer of about `characters` characters. */
export function outputTokens(characters: number): number {
  return Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(
      TEXT_GENERATION_LIMITS.postTweetGeneration,
      Math.ceil(characters / CHARACTERS_PER_TOKEN),
    ),
  );
}
