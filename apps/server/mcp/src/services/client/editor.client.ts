import type { BaseApiClient } from './base-api-client';

export interface OpenInEditorParams {
  name?: string;
  sourceVideoIds: readonly string[];
}

/**
 * Editor project create. A thin proxy to POST /editor-projects; the caller's
 * bearer token carries organization and brand, matching the Studio handoff.
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
}
