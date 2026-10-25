import type { VideoGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  CLIPPER_RESULT_STATUSES,
  type ClipperLibraryLinkStatus,
  type ClipperReadinessContract,
  type ClipperReferenceProvenance,
  type ClipperResultMode,
  type ClipRawCutFramingContract,
  type ClipRawCutMediaValidationContract,
  type ClipperResultStatus as SharedClipperResultStatus,
} from '@genfeedai/contracts/interfaces';
import type { ClipperResult as PrismaClipperResult } from '@genfeedai/prisma';

export const ClipperResultStatus = CLIPPER_RESULT_STATUSES;

export type ClipperResultStatusType = (typeof ClipperResultStatus)[number];

type ClipperResultRecord = Omit<
  PrismaClipperResult,
  'ingredientId' | 'isSelected' | 'mode' | 'readiness' | 'status' | 'terminalAt'
>;

export interface ClipperResultDocument extends ClipperResultRecord {
  isSelected: boolean;
  /** `avatar` (default) vs deterministic `raw-cut`. Real column; see #1239. */
  mode: ClipperResultMode | string;
  readiness: ClipperReadinessContract | Record<string, unknown>;
  referenceProvenance?: ClipperReferenceProvenance;
  generationBrief?: VideoGenerationBrief;
  status: SharedClipperResultStatus | string;
  terminalAt?: Date | null;
  // Raw-cut data contract. Persisted in the `data` blob and flattened by the
  // ClipperResultsService read codec so orchestrators and serializers consume a
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
  libraryLinkStatus?: ClipperLibraryLinkStatus | string | null;
  libraryLinkError?: string | null;
  framing?: ClipRawCutFramingContract;
  mediaValidation?: ClipRawCutMediaValidationContract;
  [key: string]: unknown;
}

export type { PrismaClipperResult as ClipperResult };
