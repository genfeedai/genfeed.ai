import type {
  ClipperProjectReadResponse,
  ClipperReferenceFrameSet,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type {
  AnalyzeVideoPayload,
  AnalyzeVideoResponse,
  ClipperResultRawItem,
  CreateFromIngredientPayload,
  CreateFromYoutubePayload,
  CreateFromYoutubeResponse,
  EditorHandoffResponse,
  EditorProjectResponse,
  GenerateClipsPayload,
  HighlightsResponse,
  LibraryLinkResponse,
  PrepareUploadPayload,
  PrepareUploadResponse,
  PublishHandoffResponse,
  RewriteHighlightPayload,
  RewriteHighlightResponse,
  SaveClipperDraftPayload,
  SubmitHookApprovalPayload,
} from '@genfeedai/props/studio/clipper-api.props';
import type {
  ClipperProjectSummary,
  ClipperResult,
} from '@props/studio/clipper.props';
import type { ClipperApiClient } from '@props/studio/clipper-api.props';
import { EnvironmentService } from '@services/core/environment.service';
import { getRequestOrganizationHeaders } from '@services/core/interceptor.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';
import { recordPageTotals } from '@services/core/page-totals';

import { mapClipperProjectSummary } from '../utils/map-clipper-project-summary';

export type {
  EditorHandoffResponse,
  LibraryLinkResponse,
  PublishHandoffResponse,
  RewriteHighlightPayload,
  RewriteHighlightResponse,
  SubmitHookApprovalPayload,
} from '@genfeedai/props/studio/clipper-api.props';

export class ClipperApiService implements ClipperApiClient {
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
      ...getRequestOrganizationHeaders(),
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
      `${this.apiEndpoint}/clipper-projects/analyze`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
  }

  async createDraft(brandId?: string): Promise<string> {
    const data = await this.fetchJson<{ data?: { id?: string } }>(
      `${this.apiEndpoint}/clipper-projects/drafts`,
      {
        body: JSON.stringify({ brandId }),
        method: 'POST',
      },
    );
    const projectId = data?.data?.id;

    if (!projectId) {
      throw new Error('The draft project could not be created.');
    }

    return projectId;
  }

  async saveDraft(
    projectId: string,
    payload: SaveClipperDraftPayload,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.fetchJson(
      `${this.apiEndpoint}/clipper-projects/${projectId}/draft`,
      {
        body: JSON.stringify(payload),
        method: 'PATCH',
        signal,
      },
    );
  }

  async createFromIngredient(
    payload: CreateFromIngredientPayload,
  ): Promise<AnalyzeVideoResponse> {
    return this.fetchJson<AnalyzeVideoResponse>(
      `${this.apiEndpoint}/clipper-projects/from-ingredient`,
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
      `${this.apiEndpoint}/clipper-projects/${projectId}/highlights`,
      { signal },
    );
  }

  async generateClips(
    projectId: string,
    payload: GenerateClipsPayload,
  ): Promise<void> {
    await this.fetchJson(
      `${this.apiEndpoint}/clipper-projects/${projectId}/generate`,
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
      `${this.apiEndpoint}/clipper-projects/from-youtube`,
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
      `${this.apiEndpoint}/clipper-projects/from-upload`,
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

  async finalizeUpload(
    projectId: string,
    ingredientId: string,
  ): Promise<CreateFromYoutubeResponse> {
    return this.fetchJson<CreateFromYoutubeResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/source/finalize`,
      {
        body: JSON.stringify({ ingredientId }),
        method: 'POST',
      },
    );
  }

  async retrySource(projectId: string): Promise<CreateFromYoutubeResponse> {
    return this.fetchJson<CreateFromYoutubeResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/source/retry`,
      { method: 'POST' },
    );
  }

  async retryFailedClips(projectId: string): Promise<void> {
    await this.fetchJson(
      `${this.apiEndpoint}/clipper-projects/${projectId}/retry-failed`,
      { method: 'POST' },
    );
  }

  async updateProject(
    projectId: string,
    changes: { name?: string; isDeleted?: boolean },
  ): Promise<void> {
    await this.fetchJson(`${this.apiEndpoint}/clipper-projects/${projectId}`, {
      body: JSON.stringify(changes),
      method: 'PATCH',
    });
  }

  /**
   * One server page of clip projects, newest first. A `brandId` also returns
   * the org-wide projects that have no brand. Passing `page` publishes the
   * totals for `<AutoPagination />`.
   */
  async listProjects(
    query: { brandId?: string; limit?: number; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<ClipperProjectSummary[]> {
    const params = new URLSearchParams({ sort: '-createdAt' });
    if (query.brandId) params.set('brandId', query.brandId);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.page) params.set('page', String(query.page));

    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clipper-projects?${params.toString()}`,
      { signal },
    );
    recordPageTotals(data as JsonApiResponseDocument, query);

    return this.extractCollection<ClipperResultRawItem>(data).map((item) =>
      mapClipperProjectSummary({
        attributes: item.attributes,
        id: item.id,
      }),
    );
  }

  async getProject(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ClipperProjectReadResponse> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clipper-projects/${projectId}`,
      { signal },
    );
    return this.extractPayload<ClipperProjectReadResponse>(data) ?? {};
  }

  async getHookApproval(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<HookClipApprovalStatus> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/hook-approval`,
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
      `${this.apiEndpoint}/clipper-projects/${projectId}/hook-approval`,
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
  ): Promise<ClipperReferenceFrameSet | null> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/reference-frame`,
      {
        body: JSON.stringify({ candidateId }),
        method: 'PUT',
      },
    );
    const payload = this.extractPayload<ClipperProjectReadResponse>(data);

    if (payload?.referenceFrames) {
      return payload.referenceFrames;
    }

    if (
      payload &&
      'candidates' in payload &&
      'selectedCandidateId' in payload
    ) {
      return payload as unknown as ClipperReferenceFrameSet;
    }

    return null;
  }

  async getClipperResults(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ClipperResult[]> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clipper-results?project=${projectId}&sort=-viralityScore`,
      { signal },
    );

    const rawItems = this.extractCollection<ClipperResultRawItem>(data);

    return rawItems.map((item) => {
      const attrs = item.attributes ?? item;
      return {
        ...attrs,
        id: item.id,
      } as ClipperResult;
    });
  }

  async rewriteHighlight(
    projectId: string,
    highlightId: string,
    payload: RewriteHighlightPayload,
  ): Promise<RewriteHighlightResponse> {
    return this.fetchJson<RewriteHighlightResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/highlights/${highlightId}/rewrite`,
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
    clipperResultId: string,
  ): Promise<EditorHandoffResponse> {
    return this.fetchJson<EditorHandoffResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/results/${clipperResultId}/editor-handoff`,
      { method: 'POST' },
    );
  }

  async createPublishHandoff(
    projectId: string,
    clipperResultId: string,
  ): Promise<PublishHandoffResponse> {
    return this.fetchJson<PublishHandoffResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/results/${clipperResultId}/publish-handoff`,
      { method: 'POST' },
    );
  }

  async retryLibraryLink(
    projectId: string,
    clipperResultId: string,
  ): Promise<LibraryLinkResponse> {
    return this.fetchJson<LibraryLinkResponse>(
      `${this.apiEndpoint}/clipper-projects/${projectId}/results/${clipperResultId}/library-link`,
      { method: 'POST' },
    );
  }
}
