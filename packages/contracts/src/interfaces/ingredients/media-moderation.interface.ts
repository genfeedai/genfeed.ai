import type {
  MediaModerationRecord,
  ModerationScores,
} from '../../api-types/contracts/media-moderation.contract';

/**
 * Moderation provider port (#4880). Adapters map their vendor labels onto
 * Genfeed moderation categories; a category the vendor cannot score for that
 * input is left out of the scores rather than reported as 0.
 */
export type ModerationProviderName = 'none' | 'openai';

export interface IModerationProvider {
  readonly name: ModerationProviderName;
  /** `false` for the null adapter: nothing leaves the host, nothing is scored. */
  readonly isEnabled: boolean;
  classifyImage(url: string): Promise<ModerationScores>;
  classifyFrames(urls: readonly string[]): Promise<ModerationScores[]>;
  classifyText(text: string): Promise<ModerationScores>;
}

/** A persisted moderation record for one asset, as readers see it. */
export interface IMediaModeration extends MediaModerationRecord {
  id: string;
  ingredientId: string;
  organizationId: string;
  /** The record whose result was copied for identical bytes, if any. */
  reusedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What one moderation job did: `classified` called the provider, `reused`
 * copied the result for identical bytes, `reevaluated` re-applied current
 * mode and thresholds to stored scores, `skipped` had nothing to do
 * (provider off, perception not ready, asset deleted, already current).
 */
export type MediaModerationOutcome =
  | 'classified'
  | 'reevaluated'
  | 'reused'
  | 'skipped';

/** Moderation state for an asset a publish path is about to use. */
export interface IMediaModerationLookup {
  assetId: string;
  moderation: IMediaModeration | null;
}
