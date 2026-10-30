import { createInternalRouteEdgeGuard } from '@api/helpers/utils/internal-route-edge/internal-route-edge.util';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

function buildApp(isEnabled: boolean) {
  const app = express();
  app.use(createInternalRouteEdgeGuard(isEnabled));
  app.use((_req, res) => {
    res.status(200).send('reached');
  });
  return app;
}

describe('internal route edge guard', () => {
  it('answers 403 for internal paths that came through the load balancer', async () => {
    const app = buildApp(true);

    for (const path of [
      '/v1/internal/integrations/telegram',
      '/v1/Internal/integrations/telegram',
      '/V1/INTERNAL/integrations/telegram',
      '/v1/internal',
    ]) {
      const response = await request(app)
        .get(path)
        .set('X-Forwarded-For', '203.0.113.7');

      expect(response.status, path).toBe(403);
    }
  });

  it('lets in-VPC calls without a forwarded header through', async () => {
    const response = await request(buildApp(true)).get(
      '/v1/internal/integrations/telegram',
    );

    expect(response.status).toBe(200);
  });

  it('does not touch other routes, including look-alike prefixes', async () => {
    const app = buildApp(true);

    for (const path of ['/v1/brands', '/v1/internals', '/v1/public/internal']) {
      const response = await request(app)
        .get(path)
        .set('X-Forwarded-For', '203.0.113.7');

      expect(response.status, path).toBe(200);
    }
  });

  it('is a no-op when disabled (self-host)', async () => {
    const response = await request(buildApp(false))
      .get('/v1/internal/integrations/telegram')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(response.status).toBe(200);
  });
});
