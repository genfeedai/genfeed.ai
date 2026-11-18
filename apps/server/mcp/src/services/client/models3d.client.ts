import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import type { Models3dToolInput } from '@mcp/tools/models3d.schemas';

/** Canonical 3D render routes; scopes, holds and refunds remain API-owned. */
export class Models3dClient {
  constructor(private readonly base: BaseApiClient) {}

  render3d({
    build,
    imageUrl,
    prompt,
    quality,
  }: Models3dToolInput<'render_3d'>) {
    return this.base.request(
      'creating a 3D render',
      async (http) =>
        this.base.unwrapObject<Record<string, unknown>>(
          await http.post('/models3d', {
            ...(build === undefined ? {} : { build }),
            imageUrl,
            ...(prompt === undefined ? {} : { prompt }),
            ...(quality === undefined ? {} : { quality }),
          }),
        ),
      this.base.failWithDetail('Failed to create the 3D render'),
    );
  }

  getModel3d({ id }: Models3dToolInput<'get_model3d'>) {
    return this.base.request(
      'reading a 3D render',
      async (http) =>
        this.base.unwrapObject<Record<string, unknown>>(
          await http.get(`/models3d/${encodeURIComponent(id)}`),
        ),
      this.base.failWithDetail('Failed to read the 3D render'),
    );
  }
}
