/**
 * Phrases that tell the agent to hold a media generation until the user has
 * seen the cost: "do not generate yet", "show the model and credit cost
 * first", "before generating". A match makes a credit-spending call return its
 * approval card even in Auto mode, so a plain-language hold is never
 * overridden by a model that calls the tool anyway. A false match only costs
 * one extra card, so the patterns lean toward matching.
 */
const GENERATION_HOLD_PATTERNS: readonly RegExp[] = [
  /\b(?:do\s*not|don'?t|dont|never|not)\s+(?:yet\s+)?(?:generate|render|create\s+(?:the\s+|an?\s+)?(?:image|video)|make\s+(?:the\s+|an?\s+)?(?:image|video))\b/i,
  /\b(?:without|before|prior\s+to|instead\s+of)\s+(?:you\s+)?(?:generat\w*|render\w*)\b/i,
  /\b(?:hold\s+off|wait)\b[^.?!\n]{0,30}\b(?:generat\w*|render\w*|image|video)\b/i,
  /\b(?:show|tell|give|display|quote)\b[^.?!\n]{0,40}\b(?:model|costs?|credits?|price|estimate|quote)\b/i,
  /\bhow\s+much\b[^.?!\n]{0,40}\b(?:cost|credits?)\b/i,
  /\b(?:do\s*not|don'?t|dont|never|not)\s+(?:yet\s+)?(?:spend|use|burn|charge)\b[^.?!\n]{0,20}\bcredits?\b/i,
  /\b(?:before|prior\s+to)\s+(?:you\s+)?(?:creat|mak|produc|build)\w*\s+(?:the\s+|an?\s+|any\s+)?(?:image|video|media|visual|picture)/i,
  /\b(?:ask|check\s+with|confirm\s+with|run\s+(?:it\s+)?by)\s+me\b[^.?!\n]{0,40}\b(?:first|before|approv\w*)/i,
  /\bwait\s+for\s+(?:my|me|an?)\s+(?:ok|okay|approval|go|confirm\w*)/i,
];

export function hasGenerationHoldIntent(
  operatorMessage: string | null | undefined,
): boolean {
  if (!operatorMessage) {
    return false;
  }
  return GENERATION_HOLD_PATTERNS.some((pattern) =>
    pattern.test(operatorMessage),
  );
}
