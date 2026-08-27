import type { VideoGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import {
  CLIP_RESULT_STATUSES,
  type ClipLibraryLinkStatus,
  type ClipRawCutFramingContract,
  type ClipRawCutMediaValidationContract,
  type ClipReadinessContract,
  type ClipReferenceProvenance,
  type ClipResultMode,
  type ClipResultStatus as SharedClipResultStatus,
} from '@genfeedai/interfaces';
import type { ClipResult as PrismaClipResult } from '@genfeedai/prisma';

export const ClipResultStatus = CLIP_RESULT_STATUSES;

export type ClipResultStatusType = (typeof ClipResultStatus)[number];

type ClipResultRecord = Omit<
  PrismaClipResult,
  'ingredientId' | 'isSelected' | 'mode' | 'readiness' | 'status' | 'terminalAt'
>;

export interface ClipResultDocument extends ClipResultRecord {
  isSelected: boolean;
  /** `avatar` (default) vs deterministic `raw-cut`. Real column; see #1239. */
  mode: ClipResultMode | string;
  readiness: ClipReadinessContract | Record<string, unknown>;
  referenceProvenance?: ClipReferenceProvenance;
  generationBrief?: VideoGenerationBrief;
  status: SharedClipResultStatus | string;
  terminalAt?: Date | null;
  // Raw-cut data contract. Persisted in the `data` blob and flattened by the
  // ClipResultsService read codec so orchestrators and serializers consume a
  // typed shape rather than storage details.
  startTime?: number | null;
  endTime?: number | null;
  duration?: number | null;
  videoUrl?: string | null;
  videoS3Key?: string | null;
  captionedVideoUrl?: string | null;
  captionedVideoS3Key?: string | null;
  captionSrt?: string | null;
  thumbnailUrl?: string | null;
  isProjectReconciliationPending?: boolean;
  room?: string | null;
  sourceVideoS3Key?: string | null;
  sourceVideoUrl?: string | null;
  ingredientId?: string | null;
  libraryLinkStatus?: ClipLibraryLinkStatus | string | null;
  libraryLinkError?: string | null;
  framing?: ClipRawCutFramingContract;
  mediaValidation?: ClipRawCutMediaValidationContract;
  [key: string]: unknown;
}

export type { PrismaClipResult as ClipResult };
