import type {
  ClipLibraryLinkStatus,
  ClipRawCutFramingContract,
  ClipRawCutMediaValidationContract,
  ClipReadinessContract,
  ClipReadyAction,
  ClipReferenceFrameSet,
  ClipResultMode,
  ClipResultStatus,
  ClipSourceContract,
  ClipSourceKind,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type { ClipsApiClient } from '@props/studio/clips-api.props';

// ─── Shared Types ─────────────────────────────────────────────────

export type AvatarProvider = 'argil' | 'genfeedai' | 'heygen';

export type ClipStatus = ClipResultStatus;

export type ClipReadiness = ClipReadinessContract;

export type { ClipLibraryLinkStatus, ClipReadyAction, ClipResultMode };

export type ClipsStep = 'input' | 'review' | 'progress';

export interface ClipProjectSummary {
  brandId?: string;
  createdAt?: string;
  failedClipCount: number;
  id: string;
  mode?: ClipResultMode;
  framing?: ClipRawCutFramingContract;
  mediaValidation?: ClipRawCutMediaValidationContract;
  name: string;
  pendingClipCount: number;
  progress: number;
  readyClipCount: number;
  sourceVideoUrl?: string;
  status: string;
}

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
  id: string;
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
  ingredientId?: string | null;
  libraryLinkStatus?: ClipLibraryLinkStatus;
  libraryLinkError?: string | null;
  mediaValidation?: ClipRawCutMediaValidationContract;
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
  source?: ClipSourceContract;
  hookApproval?: HookClipApprovalStatus;
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
  onCancel?: () => void;
  onModeChange: (mode: ClipResultMode) => void;
  onStartQuick: () => void;
  onSetMaxClips: (value: number) => void;
  onSetMinViralityScore: (value: number) => void;
  onSetYoutubeUrl: (value: string) => void;
  onSetSourceFile: (file: File | null) => void;
  onSetSourceKind: (kind: ClipSourceKind) => void;
  quickStartHint: string;
  sourceFile: File | null;
  sourceKind: ClipSourceKind;
  uploadProgress: number;
  youtubeUrl: string;
}

export interface ClipsProjectListProps {
  isLoading: boolean;
  projects: ClipProjectSummary[];
}

export interface ClipsProjectCardProps {
  href: string;
  project: ClipProjectSummary;
}

export interface ClipsWorkspaceProps {
  projectId?: string;
}

export interface RewriteState {
  isRewriting: boolean;
  hasBeenRewritten: boolean;
  platform: string;
  tone: string;
  rewriteError: string | null;
}

export type RewriteAction =
  | { type: 'START_REWRITE' }
  | { type: 'REWRITE_SUCCESS' }
  | { type: 'REWRITE_ERROR'; error: string }
  | { type: 'RESTORE' }
  | { type: 'SET_PLATFORM'; platform: string }
  | { type: 'SET_TONE'; tone: string };

export interface ClipResultCardProps {
  clip: ClipResult;
  clipsService: ClipsApiClient;
  mode?: ClipResultMode;
  projectId: string;
}

export interface ClipsProgressViewProps {
  clipsService: ClipsApiClient;
  isRetrying: boolean;
  onReset: () => void;
  onRetryFailedClips: () => void;
  onRetrySource: () => void;
  project: ProjectState;
  selectedCount: number;
}

export interface HighlightReviewCardProps {
  highlight: IHighlight;
  selected: boolean;
  onToggle: () => void;
  onTitleEdit: (text: string) => void;
  onScriptEdit: (text: string) => void;
  projectId?: string;
  clipsService?: ClipsApiClient;
}
