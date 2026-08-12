/**
 * Lightweight comment intent for Replies surface personas.
 * Deterministic heuristics first (no extra model call); LLM can refine later.
 */

export type ReplyIntent = 'thanks' | 'question' | 'troll' | 'spam' | 'default';

export const DEFAULT_REPLY_MAX_AGE_HOURS = 24;
/** Hard ceiling: never treat multi-day threads as fresh conversation. */
export const MAX_REPLY_MAX_AGE_HOURS = 48;

const THANKS_RE =
  /\b(thank(?:s| you)|thx|ty|appreciate|grateful|love this|great (?:post|point|take)|well said|so true)\b|^this[!.]?$/i;

const QUESTION_RE =
  /\?|^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/i;

const TROLL_RE =
  /\b(idiot|stupid|dumb|scam|fraud|bs|bullshit|shut up|cope|ratio|L\b|cringe|mid\b|garbage|trash|clown|bot\b|shill|grift|ngmi|seethe|cope harder)\b|😂{2,}|🤡/i;

const SPAM_RE =
  /\b(follow me|check (?:my|out) (?:bio|link)|dm me|telegram|whatsapp|promo code|giveaway|airdrop|crypto signal|subscribe|click here|bit\.ly|t\.me\/)\b|https?:\/\/\S+\s+https?:\/\//i;

/**
 * Classify a comment for reply persona routing.
 */
export function classifyReplyIntent(text: string): ReplyIntent {
  const normalized = text.trim();
  if (!normalized) {
    return 'spam';
  }

  if (SPAM_RE.test(normalized) || looksLikeLinkDump(normalized)) {
    return 'spam';
  }

  if (TROLL_RE.test(normalized)) {
    return 'troll';
  }

  if (THANKS_RE.test(normalized) && normalized.length < 180) {
    return 'thanks';
  }

  if (QUESTION_RE.test(normalized)) {
    return 'question';
  }

  return 'default';
}

function looksLikeLinkDump(text: string): boolean {
  const urls = text.match(/https?:\/\/\S+/gi) ?? [];
  if (urls.length >= 2) {
    return true;
  }
  const withoutUrl = text.replace(/https?:\/\/\S+/gi, '').trim();
  return urls.length === 1 && withoutUrl.length < 12;
}

export type ReplyIntentPersona = {
  intent: ReplyIntent;
  /** Skip auto-send when true (spam). */
  shouldSkipAuto: boolean;
  label: string;
  toneHint: string;
  instructions: string;
};

const PERSONAS: Record<ReplyIntent, Omit<ReplyIntentPersona, 'intent'>> = {
  thanks: {
    instructions:
      'The comment is appreciative. Reply briefly and warmly as the author. Acknowledge them, add one light next beat if natural. Do not pitch. Do not over-thank. One to three short lines max.',
    label: 'Thanks',
    shouldSkipAuto: false,
    toneHint: 'warm, short, human',
  },
  question: {
    instructions:
      'The comment asks something real. Answer with substance. Be specific. If you cannot answer fully, say what you can and invite one clarifying detail. No empty engagement bait.',
    label: 'Question',
    shouldSkipAuto: false,
    toneHint: 'clear, helpful, direct',
  },
  troll: {
    instructions:
      'The comment is hostile or trolling. Reply as a sharp operator: witty, calm, brief. Do not insult their identity, do not escalate into report-bait, do not moralize. Prefer one clean jab or a dry reframe that keeps the thread interesting. Never threaten or slur.',
    label: 'Troll',
    shouldSkipAuto: false,
    toneHint: 'dry wit, controlled, short',
  },
  spam: {
    instructions:
      'This looks like spam. Do not engage productively. Prefer no reply.',
    label: 'Spam',
    shouldSkipAuto: true,
    toneHint: 'ignore',
  },
  default: {
    instructions:
      'Reply as the post author with substance. Add one concrete next thought. Stay on-brand. Do not tag Grok. Do not use empty thank-you templates.',
    label: 'Default',
    shouldSkipAuto: false,
    toneHint: 'engaging, specific',
  },
};

export function getReplyIntentPersona(intent: ReplyIntent): ReplyIntentPersona {
  return { intent, ...PERSONAS[intent] };
}

export function resolveReplyIntent(
  text: string,
  override?: ReplyIntent | null,
): ReplyIntent {
  if (
    override === 'thanks' ||
    override === 'question' ||
    override === 'troll' ||
    override === 'spam' ||
    override === 'default'
  ) {
    return override;
  }
  return classifyReplyIntent(text);
}

export function clampReplyMaxAgeHours(hours: number | undefined): number {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) {
    return DEFAULT_REPLY_MAX_AGE_HOURS;
  }
  return Math.min(MAX_REPLY_MAX_AGE_HOURS, Math.max(1, Math.floor(hours)));
}
