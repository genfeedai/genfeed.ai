import type {
  ClipperDraftSourceKind,
  ClipperLibraryLinkStatus,
  ClipperReadinessContract,
  ClipperReadyAction,
  ClipperReferenceFrameSet,
  ClipperResultMode,
  ClipperResultStatus,
  ClipperSourceContract,
  ClipRawCutFramingContract,
  ClipRawCutMediaValidationContract,
  HookClipApprovalStatus,
  IBrand,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';
import type { CollectionViewType } from '@props/ui/collection/collection.props';
import type { ReactNode } from 'react';
import type { ClipperApiClient } from '@/props/studio/clipper-api.props';

export type AvatarProvider = 'argil' | 'genfeedai' | 'heygen';

export type ClipStatus = ClipperResultStatus;

export type ClipperReadiness = ClipperReadinessContract;

export type { ClipperLibraryLinkStatus, ClipperReadyAction, ClipperResultMode };

export type ClipperStep = 'input' | 'review' | 'progress';

export type ClipperDraftSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ClipperProjectSummary {
  updatedAt?: string;
  brandId?: string;
  createdAt?: string;
  failedClipCount: number;
  id: string;
  isDraft: boolean;
  mode?: ClipperResultMode;
  framing?: ClipRawCutFramingContract;
  mediaValidation?: ClipRawCutMediaValidationContract;
  name: string;
  pendingClipCount: number;
  progress: number;
  readyClipCount: number;
  sourceVideoUrl?: string;
  status: string;
}

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
  /** What was said in the window; the avatar speaks this. */
  script?: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export interface ClipperResult {
  id: string;
  title: string;
  summary: string;
  viralityScore: number;
  status: ClipStatus;
  readiness?: ClipperReadiness;
  readyActions?: ClipperReadyAction[];
  terminalAt?: string | null;
  videoUrl?: string;
  captionedVideoUrl?: string;
  clipType?: string;
  ingredientId?: string | null;
  libraryLinkStatus?: ClipperLibraryLinkStatus;
  libraryLinkError?: string | null;
  mediaValidation?: ClipRawCutMediaValidationContract;
  mode?: ClipperResultMode;
  duration: number;
  startTime: number;
  endTime: number;
  tags: string[];
}

export interface ProjectState {
  projectId: string;
  name?: string;
  sourceVideoUrl?: string;
  transcriptText?: string;
  status: string;
  /** Creator-readable reason a failed project stopped. */
  error?: string | null;
  highlights: IHighlight[];
  clips: ClipperResult[];
  estimatedClips?: number;
  mode: ClipperResultMode;
  referenceFrames?: ClipperReferenceFrameSet;
  source?: ClipperSourceContract;
  hookApproval?: HookClipApprovalStatus;
}

export interface ViralityBadgeProps {
  score: number;
}

export interface ClipperModeSelectorProps {
  mode: ClipperResultMode;
  onModeChange: (mode: ClipperResultMode) => void;
}

export interface ClipperReferenceFrameSelectorProps {
  error: string | null;
  onRetry: () => void;
  onSelect: (candidateId: string) => void;
  pendingCandidateId: string | null;
  referenceFrames?: ClipperReferenceFrameSet;
}

export interface ClipperSourcePreviewProps {
  name?: string;
  sourceVideoUrl?: string;
  transcriptText?: string;
  source?: ClipperSourceContract;
}

export interface ClipperInputFormProps {
  sourceOnly?: boolean;
  draftFilename?: string;
  draftSaveState: ClipperDraftSaveState;
  error: string | null;
  generationMode: ClipperResultMode;
  isSubmitting: boolean;
  maxClips: number;
  minViralityScore: number;
  onAnalyze: () => void;
  onCancel?: () => void;
  onModeChange: (mode: ClipperResultMode) => void;
  onStartQuick: () => void;
  onSetMaxClips: (value: number) => void;
  onSetMinViralityScore: (value: number) => void;
  onSetYoutubeUrl: (value: string) => void;
  onSetSourceFile: (file: File | null) => void;
  onSetSourceKind: (kind: ClipperDraftSourceKind) => void;
  quickStartHint: string;
  sourceFile: File | null;
  sourceKind: ClipperDraftSourceKind;
  uploadProgress: number;
  youtubeUrl: string;
}

export interface ClipperProjectListProps {
  isLoading: boolean;
  /** Hide the "Recent" carousel, e.g. on server pages after the first. */
  isRecentVisible?: boolean;
  projects: ClipperProjectSummary[];
  /** List or grid, owned by the workspace so the toggle sits in the subbar. */
  view: CollectionViewType;
  onRename?: (id: string, name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export interface ClipperProjectCardProps {
  actions?: ReactNode;
  href: string;
  project: ClipperProjectSummary;
}

export interface ClipperWorkspaceProps {
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

export interface ClipperResultCardProps {
  clip: ClipperResult;
  clipsService: ClipperApiClient;
  mode?: ClipperResultMode;
  projectId: string;
}

export interface ClipperProgressViewProps {
  clipsService: ClipperApiClient;
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
  clipsService?: ClipperApiClient;
}

export type StudioClipperIdentityField = 'avatar' | 'voice';

export type StudioClipperIdentitySource =
  | 'brand'
  | 'explicit'
  | 'missing'
  | 'organization';

export interface StudioClipperIdentityDefaults {
  avatarId?: string;
  avatarProvider: AvatarProvider;
  isComplete: boolean;
  missing: StudioClipperIdentityField[];
  source: StudioClipperIdentitySource;
  voiceId?: string;
}

export interface StudioClipperIdentityContext {
  selectedBrand?: Pick<IBrand, 'agentConfig'> | null;
  settings?: Pick<
    IOrganizationSetting,
    | 'defaultVoiceId'
    | 'defaultVoiceProvider'
    | 'defaultVoiceRef'
    | 'defaultAvatarRef'
  > | null;
}
