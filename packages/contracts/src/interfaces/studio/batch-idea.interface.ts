/**
 * Batch ideas — brand-data-driven studio mode (#5463).
 *
 * The user never writes prompts: brand data is turned into a batch of content
 * ideas (one LLM call), each idea is generated across image/video/avatar
 * pipelines, reviewed in a Tinder-style "Blitz" swipe, and the keepers are
 * scheduled to connected short-form socials.
 */

/** Content formats an idea batch can fan generation across. */
export type BatchIdeaFormat = 'image' | 'video' | 'avatar';

/** A single brand-derived content brief produced by the ideas endpoint. */
export interface BatchIdea {
  /** Client/server-assigned stable id (UUID). */
  id: string;
  /** Which generation pipeline this idea targets. */
  format: BatchIdeaFormat;
  /** Short scroll-stopping hook line (also used as the post label). */
  hook: string;
  /** Ready-to-publish caption copy. */
  caption: string;
  /** Visual/scene prompt fed to the image/video pipeline. */
  visualPrompt: string;
  /** Platforms this idea suits best (e.g. tiktok, instagram, youtube). */
  platformHints: string[];
  /** Spoken script for avatar ideas (UGC voiceover). */
  speechText?: string;
}
