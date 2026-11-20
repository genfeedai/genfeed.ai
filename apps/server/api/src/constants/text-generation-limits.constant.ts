/**
 * Tokens a thinking model may spend on reasoning before it writes. Reasoning
 * counts against `max_tokens`, and Gemini 4 Hydrogen (the product text model)
 * thinks at medium effort and cannot turn that off, so an answer budget with no
 * allowance comes back cut off or empty. Models that do not think stop at the
 * end of their answer and never use it; the visible length is set by the
 * prompt and the platform's own limit.
 */
const REASONING_ALLOWANCE_TOKENS = 3000;

function withReasoningAllowance(answerTokens: number): number {
  return answerTokens + REASONING_ALLOWANCE_TOKENS;
}

export const TEXT_GENERATION_LIMITS = {
  articleImagePrompt: withReasoningAllowance(400),
  articleVirality: withReasoningAllowance(700),
  contentGeneration: 3000,
  hookGeneration: withReasoningAllowance(900),
  newsletterDraft: 3000,
  newsletterTopicProposal: withReasoningAllowance(700),
  postEnhancement: withReasoningAllowance(500),
  postThreadExpansion: withReasoningAllowance(900),
  postThreadGeneration: withReasoningAllowance(900),
  postTweetGeneration: withReasoningAllowance(700),
  promptEnhancement: withReasoningAllowance(600),
  promptRemix: withReasoningAllowance(600),
  scriptDraft: 3000,
  tweetReply: withReasoningAllowance(300),
} as const;
