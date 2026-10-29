import type {
  HeyGenAvatarRef,
  IBrandAgentConfig,
  SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import {
  CLIPPER_PROJECT_STATUSES,
  type ClipProcessingFlow,
  type ClipperProjectDraft,
  type ClipperReadinessContract,
  type ClipperReferenceFrameSet,
  type ClipperResultMode,
  type ClipperSourceContract,
  type ClipperProjectStatus as SharedClipperProjectStatus,
} from '@genfeedai/contracts/interfaces';
import type { ClipperProject as PrismaClipperProject } from '@genfeedai/prisma';

export type ClipperProject = PrismaClipperProject;

export interface IHighlight {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  /** What the speaker said in the window; the avatar speaks this. */
  script?: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export const ClipperProjectStatus = CLIPPER_PROJECT_STATUSES;

export type ClipperProjectStatusType = (typeof ClipperProjectStatus)[number];

export interface ClipperProjectHighlight extends IHighlight {
  [key: string]: unknown;
}

export interface ClipperProjectSettings {
  addCaptions?: boolean;
  aspectRatio?: string;
  captionStyle?: string;
  maxClips?: number;
  maxDuration?: number;
  minDuration?: number;
  mode?: ClipperResultMode;
  flow?: ClipProcessingFlow;
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  avatarId?: string;
  avatarProvider?: SupportedAvatarVideoProviderName;
  language?: string;
  minViralityScore?: number;
  voiceId?: string;
  [key: string]: unknown;
}

type ClipperProjectRecord = Omit<
  PrismaClipperProject,
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

export interface ClipperProjectDocument extends ClipperProjectRecord {
  continuityQaStatus: string;
  continuityWorkflowExecutionId?: string | null;
  draft?: ClipperProjectDraft | null;
  error?: string | null;
  failedClipCount: number;
  highlights?: ClipperProjectHighlight[];
  language?: string;
  name?: string;
  pendingClipCount: number;
  progress: number;
  referenceFrames?: ClipperReferenceFrameSet;
  readiness: ClipperReadinessContract | Record<string, unknown>;
  readyClipCount: number;
  settings?: ClipperProjectSettings;
  source?: ClipperSourceContract;
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  status: SharedClipperProjectStatus | string;
  terminalAt?: Date | null;
  transcriptText?: string;
  workflowExecutionId?: string | null;
  [key: string]: unknown;
}
