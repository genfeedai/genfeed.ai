import type { ClipResult, IHighlight } from '@props/studio/clips.props';
import { EnvironmentService } from '@services/core/environment.service';

// ─── API Response Types ───────────────────────────────────────────

interface AnalyzeVideoPayload {
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
}

interface AnalyzeVideoResponse {
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
  avatarId: string;
  voiceId: string;
  avatarProvider: string;
}

interface ProjectResponse {
  status?: string;
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
    _id?: string;
  };
}

interface ClipResultRawItem {
  _id?: string;
  id?: string;
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

  async getProject(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectResponse> {
    const data = await this.fetchJson<unknown>(
      `${this.apiEndpoint}/clip-projects/${projectId}`,
      { signal },
    );
    return this.extractPayload<ProjectResponse>(data) ?? {};
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
        _id: item.id ?? item._id ?? (attrs as Record<string, unknown>)._id,
        ...attrs,
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
    return data?.data?.id ?? data?.data?._id;
  }
}
