/** Edit applied to a draft the user already wrote. */
export type TextActionMode = 'proofread' | 'rewrite';

/** Result of the curated `refine_text` action, read from `AgentToolResult.data`. */
export interface TextActionResult {
  /** Channel character limit the text was held to. */
  maxCharacters: number;
  mode: TextActionMode;
  platform: string;
  text: string;
  /** False when the brand has no approved voice and the text was edited without voice context. */
  hasBrandVoice: boolean;
  /** Present when `hasBrandVoice` is false: how to define the voice. */
  voiceHint?: string;
  /** Saved branded-generation receipt; absent when no voice context was applied. */
  receiptId?: string;
  /** True when the same `requestKey` returned the original result without a new charge. */
  isReplayed: boolean;
}

/** How a generated reply takes the post it answers. */
export type ReplyVariantTone =
  | 'agree'
  | 'challenge'
  | 'add-value'
  | 'funny'
  | 'professional';

/** Result of the curated `generate_reply_variants` action, read from `AgentToolResult.data`. */
export interface ReplyVariantsResult {
  /** Channel comment limit every variant was held to. */
  maxCharacters: number;
  platform: string;
  tone: ReplyVariantTone;
  /** Distinct replies, each inside `maxCharacters`; fewer than asked when the model gave fewer. */
  variants: string[];
  /** False when the brand has no approved voice and the replies were written without voice context. */
  hasBrandVoice: boolean;
  /** Present when `hasBrandVoice` is false: how to define the voice. */
  voiceHint?: string;
  /** Saved branded-generation receipt; absent when no voice context was applied. */
  receiptId?: string;
  /** True when the same `requestKey` returned the original result without a new charge. */
  isReplayed: boolean;
}
