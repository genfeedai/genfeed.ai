import type {
  AgentClipRunIdentity,
  ClipLibraryLinkStatus,
  ClipProcessingFlow,
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type {
  ClipResultMode,
  IHighlight,
} from '@genfeedai/props/studio/clips.props';

/** Shared request and response contracts implemented by the Studio clips API client. */
export interface ClipsApiClient {
  submitHookApproval(
    projectId: string,
    payload: SubmitHookApprovalPayload,
  ): Promise<HookClipApprovalStatus>;
  createEditorHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<EditorHandoffResponse>;
  createPublishHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<PublishHandoffResponse>;
  retryLibraryLink(
    projectId: string,
    clipResultId: string,
  ): Promise<LibraryLinkResponse>;
  rewriteHighlight(
    projectId: string,
    highlightId: string,
    payload: RewriteHighlightPayload,
  ): Promise<RewriteHighlightResponse>;
}

export interface AnalyzeVideoPayload {
  brandId?: string;
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
}

export interface AnalyzeVideoResponse {
  identity: AgentClipRunIdentity;
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
  mode: ClipResultMode;
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
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode: ClipResultMode;
  voiceId?: string;
  youtubeUrl: string;
}

export interface CreateFromYoutubeResponse {
  batchJobId: string;
  estimatedClips: number;
  identity?: AgentClipRunIdentity;
  projectId: string;
  status: string;
}

export interface PrepareUploadPayload {
  avatarId?: string;
  avatarProvider?: string;
  brandId?: string;
  contentType: string;
  filename: string;
  flow: ClipProcessingFlow;
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode: ClipResultMode;
  sizeBytes: number;
  voiceId?: string;
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
      clipResultId?: string;
      ingredientId?: string;
      summary?: string | null;
      title?: string | null;
    };
  };
}

export interface LibraryLinkResponse {
  clipResultId: string;
  error?: string;
  ingredientId?: string;
  status: ClipLibraryLinkStatus;
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

export interface ClipResultRawItem {
  id: string;
  attributes?: Record<string, unknown>;
}
