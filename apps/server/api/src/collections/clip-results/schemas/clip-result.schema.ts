import {
  CLIP_RESULT_STATUSES,
  type ClipReadinessContract,
  type ClipResultMode,
  type ClipResultStatus as SharedClipResultStatus,
} from '@genfeedai/interfaces';
import type { ClipResult as PrismaClipResult } from '@genfeedai/prisma';

export const ClipResultStatus = CLIP_RESULT_STATUSES;

export type ClipResultStatusType = (typeof ClipResultStatus)[number];

type ClipResultRecord = Omit<
  PrismaClipResult,
  'isSelected' | 'mode' | 'readiness' | 'status' | 'terminalAt'
>;

export interface ClipResultDocument extends ClipResultRecord {
  _id: string;
  isSelected: boolean;
  /** `avatar` (default) vs deterministic `raw-cut`. Real column; see #1239. */
  mode: ClipResultMode | string;
  project?: string | null;
  readiness: ClipReadinessContract | Record<string, unknown>;
  status: SharedClipResultStatus | string;
  terminalAt?: Date | null;
  // Raw-cut data contract. Persisted in the `data` blob and flattened by
  // BaseService.normalizeDocument; typed here so the orchestrator (#1237) and
  // serializer read a discriminated shape rather than `unknown`.
  startTime?: number | null;
  endTime?: number | null;
  duration?: number | null;
  videoUrl?: string | null;
  videoS3Key?: string | null;
  captionedVideoUrl?: string | null;
  captionedVideoS3Key?: string | null;
  captionSrt?: string | null;
  thumbnailUrl?: string | null;
  [key: string]: unknown;
}

export type { PrismaClipResult as ClipResult };
