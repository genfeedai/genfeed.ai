import type {
  MediaPerceptionFrame,
  MediaPerceptionOcrEntry,
  MediaPerceptionRecord,
} from '../../api-types/contracts/media-perception.contract';
import type { MediaReadinessKind } from '../../api-types/contracts/media-readiness.contract';

/**
 * A persisted perception record for one asset (#4879), as readers see it.
 *
 * `reusedFromId` names the record whose artefacts were copied when another
 * asset in the same organization already had identical bytes — no perception
 * step re-ran for this one.
 */
export interface IMediaPerception extends MediaPerceptionRecord {
  id: string;
  ingredientId: string;
  organizationId: string;
  reusedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Perception state for an asset a publish path is about to use. The publish
 * path never waits on perception: `isPerceptionPending` is reported instead
 * whenever a record is missing or still has retryable artefacts.
 */
export interface IMediaPerceptionLookup {
  assetId: string;
  isPerceptionPending: boolean;
  perception: IMediaPerception | null;
}

/** What the vision model is shown to describe one asset. */
export interface IMediaSceneDescriptionInput {
  brandId: string | null;
  durationSeconds: number | null;
  frames: readonly MediaPerceptionFrame[];
  kind: MediaReadinessKind;
  model: string;
  ocr: readonly MediaPerceptionOcrEntry[];
  organizationId: string;
  transcript: string | null;
}

/**
 * What one perception job did: `perceived` ran the pipeline, `reused` copied
 * the artefacts of identical bytes, `retried` re-attempted pending artefacts,
 * `skipped` found nothing to do.
 */
export type MediaPerceptionOutcome =
  | 'perceived'
  | 'retried'
  | 'reused'
  | 'skipped';

/** An asset the workers sweep hands to the perception queue. */
export interface IMediaPerceptionCandidate {
  ingredientId: string;
  organizationId: string;
}
