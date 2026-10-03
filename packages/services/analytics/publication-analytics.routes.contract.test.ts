/**
 * Route contract for `PostAnalyticsService`: every request it issues must hit a
 * route `PostsAnalyticsController` registers. The per-post refresh POSTed to
 * `/posts/:id/analytics` while the API only registers
 * `POST /posts/:postId/refresh-analytics`, so the dashboard's refresh 404'd.
 * The routes are read from the controller source so server drift fails here too.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { PostAnalyticsService } from '@services/analytics/publication-analytics.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const CONTROLLER_PATH = resolve(
  __dirname,
  '../../../apps/server/api/src/collections/posts/controllers/analytics/posts-analytics.controller.ts',
);

function normalizeRoute(route: string): string {
  return route
    .split('?')[0]
    .replace(/:[^/]+/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

function registeredRoutes(): Set<string> {
  const source = readFileSync(CONTROLLER_PATH, 'utf8');
  const prefix = source.match(/@Controller\(['"`]([^'"`]+)['"`]\)/)?.[1];
  if (!prefix) {
    throw new Error('PostsAnalyticsController has no @Controller prefix');
  }

  return new Set(
    Array.from(
      source.matchAll(
        /@(Get|Post|Put|Patch|Delete)\((?:['"`]([^'"`]*)['"`])?\)/g,
      ),
      ([, method, path = '']) =>
        `${method.toUpperCase()} ${normalizeRoute(`${prefix}/${path}`)}`,
    ),
  );
}

function clientRoute(method: 'GET' | 'POST', path: string): string {
  // The service is rooted at `${apiEndpoint}/posts`; ids become `:param`.
  return `${method} ${normalizeRoute(`posts/${path.replace(/pub_1/g, ':id')}`)}`;
}

describe('PostAnalyticsService route contract', () => {
  const routes = registeredRoutes();
  let service: PostAnalyticsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    service = new PostAnalyticsService('contract-token');
    http = installMockHttp(service);
    const document = axiosResponse(
      resourceDocument({ lastRefreshed: 'now', summary: {} }, { id: 'pub_1' }),
    );
    http.get.mockResolvedValue(document);
    http.post.mockResolvedValue(document);
  });

  it('getPostAnalytics GETs a registered route', async () => {
    await service.getPostAnalytics('pub_1', '2026-01-01', '2026-02-01');

    const [path] = http.get.mock.calls[0] as [string];
    expect(routes).toContain(clientRoute('GET', path));
  });

  it('postAnalytics POSTs the registered per-post refresh route', async () => {
    await service.postAnalytics('pub_1', 'brand_1');

    const [path] = http.post.mock.calls[0] as [string];
    expect(routes).toContain(clientRoute('POST', path));
  });

  it('postAllAnalytics POSTs the registered organization refresh route', async () => {
    await service.postAllAnalytics();

    const [path] = http.post.mock.calls[0] as [string];
    expect(routes).toContain(clientRoute('POST', path));
  });
});
