/**
 * Fastlane — brand-data-driven studio mode.
 *
 * The user never writes prompts: brand data is turned into a batch of content
 * ideas (one LLM call), each idea is generated across image/video/avatar
 * pipelines, reviewed in a Tinder-style "Blitz" swipe, and the keepers are
 * scheduled to connected short-form socials.
 */

/** Content formats Fastlane can fan generation across. */
export type FastlaneFormat = 'image' | 'video' | 'avatar';

/** A single brand-derived content brief produced by the ideas endpoint. */
export interface FastlaneIdea {
  /** Client/server-assigned stable id (UUID). */
  id: string;
  /** Which generation pipeline this idea targets. */
  format: FastlaneFormat;
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

/** Request body for the brand → ideas endpoint. */
export interface FastlaneGenerateIdeasRequest {
  /** Formats the batch should be distributed across. */
  formats: FastlaneFormat[];
  /** How many ideas to generate (1–12). */
  count: number;
  /** Optional creative angle/theme to steer the batch. */
  angle?: string;
}

/** Lifecycle of a single generated asset through the Fastlane flow. */
export type FastlaneAssetStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'approved'
  | 'rejected';

/** An idea paired with its generation/review state in the session. */
export interface FastlaneAssetItem {
  /** The originating brief. */
  idea: FastlaneIdea;
  /** Resolved ingredient id once generation lands (null until ready). */
  ingredientId: string | null;
  /** Public URL of the generated media when ready. */
  ingredientUrl?: string;
  /** Thumbnail/preview URL when available. */
  thumbnailUrl?: string;
  /** Current lifecycle status. */
  status: FastlaneAssetStatus;
  /** Failure detail when status is 'failed'. */
  errorMessage?: string;
}

/** A scheduling destination for an approved asset. */
export interface FastlaneScheduleTarget {
  /** Credential id of the connected social account. */
  credentialId: string;
  /** Canonical lowercase platform value (tiktok, instagram, youtube). */
  platform: string;
  /** When to publish; omit/undefined means publish now. */
  scheduledDate?: string;
}
