import {
  CLIP_PROJECT_STATUSES,
  type ClipReferenceFrameSet,
  type ClipReadinessContract,
  type ClipProjectStatus as SharedClipProjectStatus,
  type ClipResultMode,
} from '@genfeedai/interfaces';
import type { ClipProject as PrismaClipProject } from '@genfeedai/prisma';

export type ClipProject = PrismaClipProject;

export interface IHighlight {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export const ClipProjectStatus = CLIP_PROJECT_STATUSES;

export type ClipProjectStatusType = (typeof ClipProjectStatus)[number];

export interface ClipProjectHighlight extends IHighlight {
  [key: string]: unknown;
}

export interface ClipProjectSettings {
  addCaptions?: boolean;
  aspectRatio?: string;
  captionStyle?: string;
  maxClips?: number;
  maxDuration?: number;
  minDuration?: number;
  mode?: ClipResultMode;
  [key: string]: unknown;
}

type ClipProjectRecord = Omit<
  PrismaClipProject,
  | 'error'
  | 'failedClipCount'
  | 'pendingClipCount'
  | 'progress'
  | 'readiness'
  | 'readyClipCount'
  | 'status'
  | 'terminalAt'
>;

export interface ClipProjectDocument extends ClipProjectRecord {
  _id: string;
  brand?: string | null;
  error?: string | null;
  failedClipCount: number;
  highlights?: ClipProjectHighlight[];
  language?: string;
  name?: string;
  organization?: string;
  pendingClipCount: number;
  progress: number;
  referenceFrames?: ClipReferenceFrameSet;
  readiness: ClipReadinessContract | Record<string, unknown>;
  readyClipCount: number;
  settings?: ClipProjectSettings;
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  status: SharedClipProjectStatus | string;
  terminalAt?: Date | null;
  transcriptText?: string;
  user?: string;
  [key: string]: unknown;
}
