import type { BaseApiClient } from './base-api-client';

/** Generation modes supported by {@link ClipperClient.generateClips}. */
export type ClipperGenerationMode = 'avatar' | 'raw-cut';

export interface AnalyzeClipperProjectParams {
  youtubeUrl: string;
  language?: string;
  maxClips?: number;
  minViralityScore?: number;
  name?: string;
}

export interface CreateClipperProjectFromYoutubeParams {
  youtubeUrl: string;
  avatarId?: string;
  voiceId?: string;
  avatarProvider?: string;
  brandId?: string;
  language?: string;
  maxClips?: number;
  minViralityScore?: number;
  name?: string;
}

export interface GenerateClipperHighlightPayload {
  id: string;
  title: string;
  summary: string;
}

export interface GenerateClipsParams {
  projectId: string;
  selectedHighlightIds: string[];
  editedHighlights: GenerateClipperHighlightPayload[];
  mode?: ClipperGenerationMode;
  avatarId?: string;
  voiceId?: string;
  avatarProvider?: string;
}

export interface ListClipperProjectsParams {
  limit?: number;
  offset?: number;
}

/**
 * Clip-projects lifecycle: analyze → review highlights → generate → read
 * results. Every method is a thin proxy to the live `clipper-projects` API; the
 * caller's bearer token (set on the shared {@link BaseApiClient}) carries the
 * org scope, so tenant isolation is inherited from the API guards — the MCP
 * layer adds no business logic.
 */
export class ClipperClient {
  constructor(private readonly base: BaseApiClient) {}

  analyzeClipperProject(
    params: AnalyzeClipperProjectParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Analyzing clip project', { params });

    return this.base.request(
      'analyzing clip project',
      async (http) => {
        const response = await http.post('/clipper-projects/analyze', {
          language: params.language,
          maxClips: params.maxClips,
          minViralityScore: params.minViralityScore,
          name: params.name,
          youtubeUrl: params.youtubeUrl,
        });
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to analyze clip project'),
    );
  }

  createClipperProjectFromYoutube(
    params: CreateClipperProjectFromYoutubeParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating clip project from YouTube', { params });

    return this.base.request(
      'creating clip project from YouTube',
      async (http) => {
        const response = await http.post('/clipper-projects/from-youtube', {
          avatarId: params.avatarId,
          avatarProvider: params.avatarProvider,
          brandId: params.brandId,
          language: params.language,
          maxClips: params.maxClips,
          minViralityScore: params.minViralityScore,
          name: params.name,
          voiceId: params.voiceId,
          youtubeUrl: params.youtubeUrl,
        });
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to create clip project from YouTube'),
    );
  }

  getClipperHighlights(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting clip highlights: ${projectId}`);

    return this.base.request(
      'getting clip highlights',
      async (http) => {
        const response = await http.get(
          `/clipper-projects/${projectId}/highlights`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get clip highlights'),
    );
  }

  getClipperProject(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting clip project: ${projectId}`);

    return this.base.request(
      'getting clip project',
      async (http) => {
        const response = await http.get(`/clipper-projects/${projectId}`);
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get clip project'),
    );
  }

  generateClips(params: GenerateClipsParams): Promise<Record<string, unknown>> {
    this.base.logger.debug('Generating clips', { params });

    return this.base.request(
      'generating clips',
      async (http) => {
        const response = await http.post(
          `/clipper-projects/${params.projectId}/generate`,
          {
            avatarId: params.avatarId,
            avatarProvider: params.avatarProvider,
            editedHighlights: params.editedHighlights,
            mode: params.mode,
            selectedHighlightIds: params.selectedHighlightIds,
            voiceId: params.voiceId,
          },
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to generate clips'),
    );
  }

  listClipperProjects(
    params: ListClipperProjectsParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing clip projects', { params });

    return this.base.request(
      'listing clip projects',
      async (http) => {
        const response = await http.get('/clipper-projects', {
          params: {
            'page[limit]': params.limit ?? 10,
            'page[offset]': params.offset ?? 0,
          },
        });
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWith('Failed to list clip projects'),
    );
  }
}
