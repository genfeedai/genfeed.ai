import type {
  AgentClipperRunIdentity,
  ClipProcessingFlow,
  ClipperDraftSourceKind,
  ClipperLibraryLinkStatus,
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type {
  ClipperResultMode,
  IHighlight,
} from '@genfeedai/props/studio/clipper.props';

/** Shared request and response contracts implemented by the Studio clips API client. */
export interface ClipperApiClient {
  submitHookApproval(
    projectId: string,
    payload: SubmitHookApprovalPayload,
  ): Promise<HookClipApprovalStatus>;
  createEditorHandoff(
    projectId: string,
    clipperResultId: string,
  ): Promise<EditorHandoffResponse>;
  createPublishHandoff(
    projectId: string,
    clipperResultId: string,
  ): Promise<PublishHandoffResponse>;
  retryLibraryLink(
    projectId: string,
    clipperResultId: string,
  ): Promise<LibraryLinkResponse>;
  rewriteHighlight(
    projectId: string,
    highlightId: string,
    payload: RewriteHighlightPayload,
  ): Promise<RewriteHighlightResponse>;
}

export interface AnalyzeVideoPayload {
  brandId?: string;
  draftProjectId?: string;
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
}

export interface AnalyzeVideoResponse {
  identity: AgentClipperRunIdentity;
  projectId: string;
}

export interface HighlightsResponse {
  status: string;
  highlights?: IHighlight[];
}

export interface GenerateClipsPayload {
  selectedHighlightIds: string[];
  editedHighlights: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  avatarId?: string;
  avatarProvider?: string;
  mode: ClipperResultMode;
  voiceId?: string;
}

export interface SubmitHookApprovalPayload {
  action: HookClipApprovalAction;
  feedback?: string;
}

export interface CreateFromYoutubePayload {
  avatarId?: string;
  avatarProvider?: string;
  brandId?: string;
  draftProjectId?: string;
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode: ClipperResultMode;
  voiceId?: string;
  youtubeUrl: string;
}

export interface CreateFromYoutubeResponse {
  batchJobId: string;
  estimatedClips: number;
  identity?: AgentClipperRunIdentity;
  projectId: string;
  status: string;
}

export interface PrepareUploadPayload {
  avatarId?: string;
  avatarProvider?: string;
  brandId?: string;
  contentType: string;
  draftProjectId?: string;
  filename: string;
  flow: ClipProcessingFlow;
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode: ClipperResultMode;
  sizeBytes: number;
  voiceId?: string;
}

export interface SaveClipperDraftPayload {
  filename?: string;
  maxClips: number;
  minViralityScore: number;
  mode: ClipperResultMode;
  sourceKind: ClipperDraftSourceKind;
  youtubeUrl: string;
}

/** The latest form state waiting to be autosaved onto a draft. */
export interface QueuedClipperDraftSave {
  payload: SaveClipperDraftPayload;
  projectId: string;
  snapshot: string;
}

export interface CreateFromIngredientPayload {
  brandId?: string;
  ingredientId: string;
}

export interface PrepareUploadResponse {
  expiresIn: number;
  ingredientId: string;
  projectId: string;
  publicUrl: string;
  uploadUrl: string;
}

export interface EditorHandoffResponse {
  editorPath: string;
  editorProjectId: string;
  videoUrl: string;
}

export interface PublishHandoffResponse {
  payload: {
    assets: Array<{
      assetId: string;
      caption?: string;
      mediaUrl: string;
      mimeType: string;
    }>;
    metadata?: {
      clipperResultId?: string;
      ingredientId?: string;
      summary?: string | null;
      title?: string | null;
    };
  };
}

export interface LibraryLinkResponse {
  clipperResultId: string;
  error?: string;
  ingredientId?: string;
  status: ClipperLibraryLinkStatus;
}

export interface RewriteHighlightPayload {
  platform: string;
  tone: string;
}

export interface RewriteHighlightResponse {
  rewrittenScript: string;
}

export interface EditorProjectResponse {
  data?: {
    id?: string;
  };
}

export interface ClipperResultRawItem {
  id: string;
  attributes?: Record<string, unknown>;
}
