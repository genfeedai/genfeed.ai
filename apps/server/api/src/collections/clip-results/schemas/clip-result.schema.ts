import {
  CLIP_RESULT_STATUSES,
  type ClipReadinessContract,
  type ClipResultStatus as SharedClipResultStatus,
} from '@genfeedai/interfaces';
import type { ClipResult as PrismaClipResult } from '@genfeedai/prisma';

export const ClipResultStatus = CLIP_RESULT_STATUSES;

export type ClipResultStatusType = (typeof ClipResultStatus)[number];

type ClipResultRecord = Omit<
  PrismaClipResult,
  'isSelected' | 'readiness' | 'status' | 'terminalAt'
>;

export interface ClipResultDocument extends ClipResultRecord {
  _id: string;
  isSelected: boolean;
  project?: string | null;
  readiness: ClipReadinessContract | Record<string, unknown>;
  status: SharedClipResultStatus | string;
  terminalAt?: Date | null;
  videoUrl?: string | null;
  [key: string]: unknown;
}

export type { PrismaClipResult as ClipResult };
