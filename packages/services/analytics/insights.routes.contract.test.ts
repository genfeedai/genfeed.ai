/**
 * Contract test for issue #5290: the Analytics Insights page always showed
 * "unavailable" because the client (this package) called routes the API
 * never registered — `/insights/insights`, `/insights/predict/trends`,
 * `/insights/engagement/score`, `/insights/roi`, `/insights/audience`,
 * `/insights/competitors`, `/insights/predict/viral/:id` — none of which
 * exist on `InsightsController`
 * (apps/server/api/src/collections/insights/controllers/insights.controller.ts).
 *
 * That controller registers exactly these routes under `@Controller('insights')`:
 *   GET    /insights
 *   POST   /insights/forecast
 *   POST   /insights/viral
 *   GET    /insights/gaps
 *   GET    /insights/times
 *   GET    /insights/growth
 *   PATCH  /insights/:insightId
 *
 * This test pins the client to that list. It fails on the pre-fix module
 * because `PredictiveAnalyticsService` (deleted by the #5290 fix) issued
 * requests to unregistered `/analytics/*` paths and was exported alongside
 * `InsightsService`. It passes once the dead client is removed and the
 * surviving `InsightsService` only ever targets registered routes.
 */
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import * as insightsServiceModule from '@services/analytics/insights.service';
import { InsightsService } from '@services/analytics/insights.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

/**
 * Sub-paths `InsightsController` actually registers under `/insights`
 * (see file header). The frontend `InsightsServiceClass` is constructed
 * against a base URL of `${apiEndpoint}/insights`, so every request it
 * issues must resolve to one of these relative to that base.
 */
const REGISTERED_INSIGHTS_SUBPATHS = [
  '', // GET /insights (root, `?limit=`)
  'forecast', // POST /insights/forecast
  'viral', // POST /insights/viral
  'gaps', // GET /insights/gaps
  'times', // GET /insights/times
  'growth', // GET /insights/growth
] as const;

function isRegisteredInsightIdPath(path: string): boolean {
  // PATCH /insights/:insightId — the client calls this with a concrete id.
  return /^[^/?]+$/.test(path) && path.length > 0;
}

function isRegisteredSubpath(path: string): boolean {
  const [withoutQuery] = path.split('?');
  return (REGISTERED_INSIGHTS_SUBPATHS as readonly string[]).includes(
    withoutQuery,
  );
}

describe('insights.service route contract', () => {
  it('exports only the client that has a matching backend route', () => {
    // PredictiveAnalyticsService (deleted) called /analytics/insights,
    // /analytics/predict/trends, /analytics/engagement/score, /analytics/roi,
    // /analytics/audience, /analytics/competitors and
    // /analytics/predict/viral/:id — none registered on any controller.
    // Its removal is the fix: this module must export nothing else.
    expect(Object.keys(insightsServiceModule).sort()).toEqual([
      'InsightsService',
    ]);
  });

  it('InsightsService.getInsights GETs a registered subpath', async () => {
    const service = InsightsService.getInstance('contract-token');
    const http = installMockHttp(service);
    http.get.mockResolvedValue(axiosResponse(collectionDocument([])));

    await service.getInsights(5);

    const [calledPath] = http.get.mock.calls[0] as [string];
    expect(isRegisteredSubpath(calledPath)).toBe(true);
  });

  it('InsightsService.markAsRead PATCHes the registered :insightId route', async () => {
    const service = InsightsService.getInstance('contract-token');
    const http = installMockHttp(service);
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({}, { id: 'insight_1' })),
    );

    await service.markAsRead('insight_1');

    const [calledPath] = http.patch.mock.calls[0] as [string];
    expect(isRegisteredInsightIdPath(calledPath)).toBe(true);
  });

  it('InsightsService.markAsDismissed PATCHes the registered :insightId route', async () => {
    const service = InsightsService.getInstance('contract-token');
    const http = installMockHttp(service);
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({}, { id: 'insight_2' })),
    );

    await service.markAsDismissed('insight_2');

    const [calledPath] = http.patch.mock.calls[0] as [string];
    expect(isRegisteredInsightIdPath(calledPath)).toBe(true);
  });
});
