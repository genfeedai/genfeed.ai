import type {
  ReplyVariantTone,
  TextActionMode,
} from '../interfaces/ai/text-action.interface';

/** Edits `refine_text` applies to a draft the user already wrote. */
export const TEXT_ACTION_MODES = [
  'proofread',
  'rewrite',
] as const satisfies readonly TextActionMode[];

/** Longest draft one text action accepts, in characters. */
export const TEXT_ACTION_MAX_INPUT_LENGTH = 10_000;

/** Stances a generated reply can take; the server owns what each one asks of the model. */
export const REPLY_VARIANT_TONES = [
  'agree',
  'challenge',
  'add-value',
  'funny',
  'professional',
] as const satisfies readonly ReplyVariantTone[];

export const REPLY_VARIANTS_DEFAULT = 3;
export const REPLY_VARIANTS_MAX = 5;

/** Longest post a reply request carries as context, in characters. */
export const REPLY_POST_MAX_INPUT_LENGTH = 5_000;

/**
 * Longest comment each platform accepts, in characters. A channel caption
 * limit is for posts and videos; a reply is a comment, which LinkedIn and
 * TikTok cap lower and YouTube allows more. A platform missing here falls back
 * to its caption limit.
 */
export const REPLY_MAX_CHARACTERS: Readonly<Record<string, number>> = {
  facebook: 8_000,
  instagram: 2_200,
  linkedin: 1_250,
  reddit: 10_000,
  tiktok: 150,
  twitter: 280,
  youtube: 10_000,
};

/** Shown when text was written without voice context, so the user can fix the cause. */
export const NO_BRAND_VOICE_HINT =
  'This brand has no approved voice yet, so the text was written without voice context. Set up and approve your brand voice in Genfeed to use it.';
