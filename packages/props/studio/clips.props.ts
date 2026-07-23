import type {
  ClipReadinessContract,
  ClipReadyAction,
  ClipReferenceFrameSet,
  ClipResultMode,
  ClipResultStatus,
} from '@genfeedai/interfaces';

// ─── Shared Types ─────────────────────────────────────────────────

export type AvatarProvider = 'heygen';

export type ClipStatus = ClipResultStatus;

export type ClipReadiness = ClipReadinessContract;

export type { ClipReadyAction, ClipResultMode };

export type ClipsStep = 'input' | 'review' | 'progress';

// ─── Data Interfaces ──────────────────────────────────────────────

export interface ProviderOption {
  value: AvatarProvider;
  label: string;
  description: string;
  disabled: boolean;
}

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

export interface ClipResult {
  _id: string;
  title: string;
  summary: string;
  viralityScore: number;
  status: ClipStatus;
  readiness?: ClipReadiness;
  readyActions?: ClipReadyAction[];
  terminalAt?: string | null;
  videoUrl?: string;
  captionedVideoUrl?: string;
  clipType?: string;
  mode?: ClipResultMode;
  duration: number;
  startTime: number;
  endTime: number;
  tags: string[];
}

export interface ProjectState {
  projectId: string;
  status: string;
  highlights: IHighlight[];
  clips: ClipResult[];
  estimatedClips?: number;
  mode: ClipResultMode;
  referenceFrames?: ClipReferenceFrameSet;
}

// ─── Component Props ──────────────────────────────────────────────

export interface ViralityBadgeProps {
  score: number;
}

export interface ClipModeSelectorProps {
  mode: ClipResultMode;
  onModeChange: (mode: ClipResultMode) => void;
}

export interface ClipReferenceFrameSelectorProps {
  error: string | null;
  onRetry: () => void;
  onSelect: (candidateId: string) => void;
  pendingCandidateId: string | null;
  referenceFrames?: ClipReferenceFrameSet;
}

export interface ClipsInputFormProps {
  error: string | null;
  generationMode: ClipResultMode;
  isSubmitting: boolean;
  maxClips: number;
  minViralityScore: number;
  onAnalyze: () => void;
  onModeChange: (mode: ClipResultMode) => void;
  onStartQuick: () => void;
  onSetMaxClips: (value: number) => void;
  onSetMinViralityScore: (value: number) => void;
  onSetYoutubeUrl: (value: string) => void;
  quickStartHint: string;
  youtubeUrl: string;
}
