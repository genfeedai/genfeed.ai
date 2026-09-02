import type {
  AgentClipRunIdentity,
  ClipLibraryLinkStatus,
  ClipProcessingFlow,
  ClipProjectReadResponse,
  ClipReferenceFrameSet,
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type {
  ClipProjectSummary,
  ClipResult,
  ClipResultMode,
  IHighlight,
} from '@props/studio/clips.props';
import { EnvironmentService } from '@services/core/environment.service';

import { mapClipProjectSummary } from '../utils/map-clip-project-summary';

// ─── API Response Types ───────────────────────────────────────────

interface AnalyzeVideoPayload {
  brandId?: string;
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
}

interface AnalyzeVideoResponse {
  identity: AgentClipRunIdentity;
  projectId: string;
}

interface HighlightsResponse {
  status: string;
  highlights?: IHighlight[];
}

interface GenerateClipsPayload {
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

interface SubmitHookApprovalPayload {
  action: HookClipApprovalAction;
  feedback?: string;
}

interface CreateFromYoutubePayload {
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

interface CreateFromYoutubeResponse {
  batchJobId: string;
  estimatedClips: number;
  identity?: AgentClipRunIdentity;
  projectId: string;
  status: string;
}

interface PrepareUploadPayload {
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

interface PrepareUploadResponse {
  expiresIn: number;
  ingredientId: string;
  projectId: string;
  publicUrl: string;
  uploadUrl: string;
}

interface EditorHandoffResponse {
  editorPath: string;
  editorProjectId: string;
  videoUrl: string;
}

interface PublishHandoffResponse {
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

interface LibraryLinkResponse {
  clipResultId: string;
  error?: string;
  ingredientId?: string;
  status: ClipLibraryLinkStatus;
}

interface RewriteHighlightPayload {
  platform: string;
  tone: string;
}

interface RewriteHighlightResponse {
  rewrittenScript: string;
}

interface EditorProjectResponse {
  data?: {
    id?: string;
  };
}

interface ClipResultRawItem {
  id: string;
  attributes?: Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────

export class ClipsApiService {
  private readonly apiEndpoint: string;
  private readonly getToken: () => Promise<string>;

  constructor(getToken: () => Promise<string>) {
    this.apiEndpoint = EnvironmentService.apiEndpoint;
    this.getToken = getToken;
  }

  private async fetchJson<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message =
        (errorData as Record<string, string> | null)?.message ??
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  private extractPayload<T>(payload: unknown): T | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as {
      data?: { attributes?: T } | T;
    };

    if (
      record.data &&
      typeof record.data === 'object' &&
      'attributes' in record.data &&
      record.data.attributes
    ) {
      return record.data.attributes;
    }

    if (record.data) {
      return record.data as T;
    }

    return payload as T;
  }

  private extractCollection<T>(payload: unknown): T[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as { data?: unknown };

    if (Array.isArray(record.data)) {
      return record.data as T[];
    }

    if (Array.isArray(payload)) {
      return payload as T[];
    }

    return [];
  }

  // ─── Public API Methods ───────────────────────────────────────

  async analyzeVideo(
    payload: AnalyzeVideoPayload,
  ): Promise<AnalyzeVideoResponse> {
    return this.fetchJson<AnalyzeVideoResponse>(
      `${this.apiEndpoint}/clip-projects/analyze`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async getHighlights(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<HighlightsResponse> {
    return this.fetchJson<HighlightsResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/highlights`,
      { signal },
    );
  }

  async generateClips(
    projectId: string,
    payload: GenerateClipsPayload,
  ): Promise<void> {
    await this.fetchJson(
      `${this.apiEndpoint}/clip-projects/${projectId}/generate`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async createFromYoutube(
    payload: CreateFromYoutubePayload,
  ): Promise<CreateFromYoutubeResponse> {
    return this.fetchJson<CreateFromYoutubeResponse>(
      `${this.apiEndpoint}/clip-projects/from-youtube`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async prepareUpload(
    payload: PrepareUploadPayload,
  ): Promise<PrepareUploadResponse> {
    return this.fetchJson<PrepareUploadResponse>(
      `${this.apiEndpoint}/clip-projects/from-upload`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async uploadSource(
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', uploadUrl);
      request.setRequestHeader(
        'Content-Type',
        file.type || 'application/octet-stream',
      );
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      request.addEventListener('load', () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(new Error(`Source upload failed with status ${request.status}`));
      });
      request.addEventListener('error', () => {
        reject(new Error('Source upload could not reach storage.'));
      });
      request.addEventListener('abort', () => {
        reject(new Error('Source upload was cancelled.'));
      });
      request.send(file);
    });
  }

  async finalizeUpload(projectId: string): Promise<CreateFromYoutubeResponse> {
    return this.fetchJson<CreateFromYoutubeResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/source/finalize`,
      { method: 'POST' },
    );
  }

  async retrySource(projectId: string): Promise<CreateFromYoutubeResponse> {
    return this.fetchJson<CreateFromYoutubeResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/source/retry`,
      { method: 'POST' },
    );
  }

  async retryFailedClips(projectId: string): Promise<void> {
    await this.fetchJson(
      `${this.apiEndpoint}/clip-projects/${projectId}/retry-failed`,
      { method: 'POST' },
    );
  }

  async listProjects(signal?: AbortSignal): Promise<ClipProjectSummary[]> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects?sort=-createdAt`,
      { signal },
    );

    return this.extractCollection<ClipResultRawItem>(data).map((item) =>
      mapClipProjectSummary({
        attributes: item.attributes,
        id: item.id,
      }),
    );
  }

  async getProject(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ClipProjectReadResponse> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects/${projectId}`,
      { signal },
    );
    return this.extractPayload<ClipProjectReadResponse>(data) ?? {};
  }

  async getHookApproval(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<HookClipApprovalStatus> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects/${projectId}/hook-approval`,
      { signal },
    );
    return (
      this.extractPayload<HookClipApprovalStatus>(data) ?? {
        attempt: 0,
        remainingClipCount: 0,
        state: 'not_required',
      }
    );
  }

  async submitHookApproval(
    projectId: string,
    payload: SubmitHookApprovalPayload,
  ): Promise<HookClipApprovalStatus> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects/${projectId}/hook-approval`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
    return (
      this.extractPayload<HookClipApprovalStatus>(data) ?? {
        attempt: 0,
        remainingClipCount: 0,
        state: 'not_required',
      }
    );
  }

  async selectReferenceFrame(
    projectId: string,
    candidateId: string,
  ): Promise<ClipReferenceFrameSet | null> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects/${projectId}/reference-frame`,
      {
        body: JSON.stringify({ candidateId }),
        method: 'PUT',
      },
    );
    const payload = this.extractPayload<ClipProjectReadResponse>(data);

    if (payload?.referenceFrames) {
      return payload.referenceFrames;
    }

    if (
      payload &&
      'candidates' in payload &&
      'selectedCandidateId' in payload
    ) {
      return payload as unknown as ClipReferenceFrameSet;
    }

    return null;
  }

  async getClipResults(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ClipResult[]> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-results?project=${projectId}&sort=-viralityScore`,
      { signal },
    );

    const rawItems = this.extractCollection<ClipResultRawItem>(data);

    return rawItems.map((item) => {
      const attrs = item.attributes ?? item;
      return {
        ...attrs,
        id: item.id,
      } as ClipResult;
    });
  }

  async rewriteHighlight(
    projectId: string,
    highlightId: string,
    payload: RewriteHighlightPayload,
  ): Promise<RewriteHighlightResponse> {
    return this.fetchJson<RewriteHighlightResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/highlights/${highlightId}/rewrite`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async createEditorProject(videoUrl: string): Promise<string | undefined> {
    const data = await this.fetchJson<EditorProjectResponse>(
      `${this.apiEndpoint}/editor-projects`,
      {
        body: JSON.stringify({ videoUrl }),
        method: 'POST',
      },
    );
    return data?.data?.id;
  }

  async createEditorHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<EditorHandoffResponse> {
    return this.fetchJson<EditorHandoffResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/results/${clipResultId}/editor-handoff`,
      { method: 'POST' },
    );
  }

  async createPublishHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<PublishHandoffResponse> {
    return this.fetchJson<PublishHandoffResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/results/${clipResultId}/publish-handoff`,
      { method: 'POST' },
    );
  }

  async retryLibraryLink(
    projectId: string,
    clipResultId: string,
  ): Promise<LibraryLinkResponse> {
    return this.fetchJson<LibraryLinkResponse>(
      `${this.apiEndpoint}/clip-projects/${projectId}/results/${clipResultId}/library-link`,
      { method: 'POST' },
    );
  }
}
