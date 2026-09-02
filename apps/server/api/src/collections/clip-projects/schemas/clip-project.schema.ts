import type { SupportedAvatarVideoProviderName } from '@genfeedai/contracts/interfaces';
import {
  CLIP_PROJECT_STATUSES,
  type ClipProcessingFlow,
  type ClipReadinessContract,
  type ClipReferenceFrameSet,
  type ClipResultMode,
  type ClipSourceContract,
  type ClipProjectStatus as SharedClipProjectStatus,
} from '@genfeedai/contracts/interfaces';
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
  flow?: ClipProcessingFlow;
  avatarId?: string;
  avatarProvider?: SupportedAvatarVideoProviderName;
  language?: string;
  minViralityScore?: number;
  voiceId?: string;
  [key: string]: unknown;
}

type ClipProjectRecord = Omit<
  PrismaClipProject,
  | 'continuityWorkflowExecutionId'
  | 'error'
  | 'failedClipCount'
  | 'pendingClipCount'
  | 'progress'
  | 'readiness'
  | 'readyClipCount'
  | 'status'
  | 'terminalAt'
  | 'workflowExecutionId'
>;

export interface ClipProjectDocument extends ClipProjectRecord {
  continuityQaStatus: string;
  continuityWorkflowExecutionId?: string | null;
  error?: string | null;
  failedClipCount: number;
  highlights?: ClipProjectHighlight[];
  language?: string;
  name?: string;
  pendingClipCount: number;
  progress: number;
  referenceFrames?: ClipReferenceFrameSet;
  readiness: ClipReadinessContract | Record<string, unknown>;
  readyClipCount: number;
  settings?: ClipProjectSettings;
  source?: ClipSourceContract;
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  status: SharedClipProjectStatus | string;
  terminalAt?: Date | null;
  transcriptText?: string;
  workflowExecutionId?: string | null;
  [key: string]: unknown;
}
