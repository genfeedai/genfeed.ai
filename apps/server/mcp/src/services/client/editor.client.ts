import type { BaseApiClient } from './base-api-client';

export interface ListEditorProjectsParams {
  limit?: number;
  page?: number;
}

export interface OpenInEditorParams {
  name?: string;
  sourceVideoIds: readonly string[];
}

/**
 * Editor project create and reads. Thin proxies to /editor-projects; the
 * caller's bearer token carries organization and brand, matching the Studio
 * handoff.
 */
export class EditorClient {
  constructor(private readonly base: BaseApiClient) {}

  openInEditor(params: OpenInEditorParams): Promise<Record<string, unknown>> {
    this.base.logger.debug('Opening videos in the Editor', { params });

    return this.base.request(
      'opening videos in the Editor',
      async (http) => {
        const response = await http.post('/editor-projects', {
          ...(params.name ? { name: params.name } : {}),
          sourceVideoIds: [...params.sourceVideoIds],
        });
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to open videos in the Editor'),
    );
  }

  listEditorProjects(
    params: ListEditorProjectsParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing Editor projects', { params });

    return this.base.request(
      'listing Editor projects',
      async (http) => {
        const response = await http.get('/editor-projects', {
          params: { limit: params.limit ?? 10, page: params.page ?? 1 },
        });
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWith('Failed to list Editor projects'),
    );
  }

  getEditorProject(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting Editor project: ${projectId}`);

    return this.base.request(
      'getting Editor project',
      async (http) => {
        const response = await http.get(
          `/editor-projects/${encodeURIComponent(projectId)}`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get Editor project'),
    );
  }

  startEditorRender(projectId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Starting Editor render: ${projectId}`);

    return this.base.request(
      'starting Editor render',
      async (http) => {
        const response = await http.post(
          `/editor-projects/${encodeURIComponent(projectId)}/render`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to start the Editor render'),
    );
  }
}
