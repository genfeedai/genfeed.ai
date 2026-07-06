import type { BaseApiClient } from './base-api-client';

/**
 * Generation mode for {@link ClipsClient.generateClips}. `avatar` is the only
 * mode the live API honors today; `raw-cut` is forwarded verbatim and starts
 * working once the API's generate contract accepts it (#1238) — until then the
 * API's ValidationPipe strips the unknown field, so sending it is inert.
 */
export type ClipGenerationMode = 'avatar' | 'raw-cut';

export interface AnalyzeClipProjectParams {
  youtubeUrl: string;
  language?: string;
  maxClips?: number;
  minViralityScore?: number;
  name?: string;
}

export interface CreateClipProjectFromYoutubeParams {
  youtubeUrl: string;
  avatarId: string;
  voiceId: string;
  avatarProvider?: string;
  language?: string;
  maxClips?: number;
  minViralityScore?: number;
  name?: string;
}

export interface GenerateClipHighlightPayload {
  id: string;
  title: string;
  summary: string;
}

export interface GenerateClipsParams {
  projectId: string;
  selectedHighlightIds: string[];
  editedHighlights: GenerateClipHighlightPayload[];
  mode?: ClipGenerationMode;
  avatarId?: string;
  voiceId?: string;
  avatarProvider?: string;
}

export interface ListClipProjectsParams {
  limit?: number;
  offset?: number;
}

/**
 * Clip-projects lifecycle: analyze → review highlights → generate → read
 * results. Every method is a thin proxy to the live `clip-projects` API; the
 * caller's bearer token (set on the shared {@link BaseApiClient}) carries the
 * org scope, so tenant isolation is inherited from the API guards — the MCP
 * layer adds no business logic.
 */
export class ClipsClient {
  constructor(private readonly base: BaseApiClient) {}

  analyzeClipProject(
    params: AnalyzeClipProjectParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Analyzing clip project', { params });

    return this.base.request(
      'analyzing clip project',
      async (http) => {
        const response = await http.post('/clip-projects/analyze', {
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

  createClipProjectFromYoutube(
    params: CreateClipProjectFromYoutubeParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating clip project from YouTube', { params });

    return this.base.request(
      'creating clip project from YouTube',
      async (http) => {
        const response = await http.post('/clip-projects/from-youtube', {
          avatarId: params.avatarId,
          avatarProvider: params.avatarProvider,
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

  getClipHighlights(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting clip highlights: ${projectId}`);

    return this.base.request(
      'getting clip highlights',
      async (http) => {
        const response = await http.get(
          `/clip-projects/${projectId}/highlights`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get clip highlights'),
    );
  }

  getClipProject(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting clip project: ${projectId}`);

    return this.base.request(
      'getting clip project',
      async (http) => {
        const response = await http.get(`/clip-projects/${projectId}`);
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
        // `mode` is forwarded verbatim; the API honors it once #1238 lands and
        // strips it (whitelist validation) until then, so raw-cut slots in with
        // no client change.
        const response = await http.post(
          `/clip-projects/${params.projectId}/generate`,
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

  listClipProjects(
    params: ListClipProjectsParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing clip projects', { params });

    return this.base.request(
      'listing clip projects',
      async (http) => {
        const response = await http.get('/clip-projects', {
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
