import type { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { TENANT_READ_AUTOMATION_ROUTES } from '@api/collections/contexts/utils/tenant-read-automation.registry';
import { TENANT_READ_ACCOUNT_ROUTES } from '@api/collections/imported-sources/tenant-read-account.registry';
import { PersonaGrantsController } from '@api/collections/personas/controllers/persona-grants.controller';
import type { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { TENANT_READ_CONTENT_ROUTES } from '@api/collections/videos/tenant-read-content.registry';
import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import type { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { NotificationRuntimeSettingsController } from '@api/endpoints/admin/platform-settings/notification-runtime-settings.controller';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import type { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import type { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { type ExecutionContext, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { defer, firstValueFrom, of } from 'rxjs';

const cohorts = [
  TENANT_READ_ACCOUNT_ROUTES,
  TENANT_READ_AUTOMATION_ROUTES,
  TENANT_READ_CONTENT_ROUTES,
] as const;
const routes = cohorts.flatMap((cohort) => [...cohort]);
const user: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: testId('org'),
  brandId: testId('brand'),
  isSuperAdmin: true,
};
const foreignOrg = testId('org', 2);
const reflector = new Reflector();
const interceptor = new TenantContextInterceptor(reflector);

function actualHandler(controller: { prototype: object }, property: string) {
  const handler: unknown = Reflect.get(controller.prototype, property);
  if (typeof handler !== 'function')
    throw new Error('Missing registered tenant read handler');
  return handler;
}
function paths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((path) => typeof path === 'string'))
    return value;
  throw new Error('Missing registered route metadata');
}
function canonicalRoutes(controller: { prototype: object }, handler: object) {
  return paths(Reflect.getMetadata(PATH_METADATA, controller)).flatMap(
    (prefix) =>
      paths(Reflect.getMetadata(PATH_METADATA, handler)).map((path) =>
        `/v1/${[prefix, path]
          .map((part) => part.replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')}`.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}'),
      ),
  );
}
function execution(
  request: Record<string, unknown>,
  controller: { prototype: object },
  handler: object,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// Independent, safe route-only snapshot from the source-qualified v18 artifact.
const observedTemplates = [
  '/v1/ads/research',
  '/v1/agent-campaigns/{id}/status',
  '/v1/agent-strategies/{id}/opportunities',
  '/v1/agent-strategies/{id}/performance-snapshot',
  '/v1/agent-strategies/{id}/reports',
  '/v1/agent-strategies/{id}/workflow-binding',
  '/v1/agent-workflows/{workflowId}',
  '/v1/agent/goals',
  '/v1/agent/goals/{goalId}',
  '/v1/agent/memories',
  '/v1/agent/memories/brands/{brandId}',
  '/v1/agent/memories/organization',
  '/v1/agent/memories/personal',
  '/v1/agent/runs',
  '/v1/agent/threads',
  '/v1/agent/threads/{threadId}',
  '/v1/agent/threads/{threadId}/events',
  '/v1/agent/threads/{threadId}/messages/{messageId}',
  '/v1/agent/threads/{threadId}/messages/{messageId}/artifact-references',
  '/v1/agent/threads/{threadId}/snapshot',
  '/v1/agent/threads/{threadId}/work-objects',
  '/v1/agent/transfers',
  '/v1/agent/transfers/conversations',
  '/v1/agent/transfers/{id}',
  '/v1/articles/{articleId}/versions',
  '/v1/articles/{articleId}/website-traffic',
  '/v1/auth/bootstrap',
  '/v1/batch-projects/{id}',
  '/v1/batches',
  '/v1/batches/{id}',
  '/v1/bot-activities',
  '/v1/bot-activities/stats/summary',
  '/v1/bot-activities/{id}',
  '/v1/brands/interview/{interviewId}',
  '/v1/brands/slug',
  '/v1/brands/{brandId}',
  '/v1/brands/{brandId}/agent-context',
  '/v1/brands/{brandId}/analytics',
  '/v1/brands/{brandId}/analytics/timeseries',
  '/v1/brands/{brandId}/completeness',
  '/v1/brands/{brandId}/content-runs',
  '/v1/brands/{brandId}/content/plans',
  '/v1/brands/{brandId}/content/plans/{planId}',
  '/v1/brands/{brandId}/expert-path',
  '/v1/brands/{brandId}/expert-path/first-system',
  '/v1/brands/{brandId}/generation-receipts',
  '/v1/brands/{brandId}/generation-receipts/identity-preview',
  '/v1/brands/{brandId}/generation-receipts/{receiptId}/history',
  '/v1/brands/{brandId}/imported-sources/{id}',
  '/v1/brands/{brandId}/imported-sources/{id}/media',
  '/v1/brands/{brandId}/interview/active',
  '/v1/brands/{brandId}/memory',
  '/v1/brands/{brandId}/memory/insights',
  '/v1/brands/{brandId}/optimization/recommendations',
  '/v1/brands/{brandId}/optimization/suggestions',
  '/v1/brands/{brandId}/platforms/{platform}/analytics',
  '/v1/brands/{brandId}/storyboard-runs',
  '/v1/brands/{brandId}/storyboard-runs/{runId}',
  '/v1/brands/{brandId}/storyboard-runs/{runId}/capabilities',
  '/v1/brands/{brandId}/storyboard-runs/{runId}/shots/{shotId}/character-replacements',
  '/v1/brands/{brandId}/storyboard-runs/{runId}/shots/{shotId}/character-replacements/{operationId}',
  '/v1/brands/{id}/brand-kit/brand-os',
  '/v1/brands/{id}/brand-os/export',
  '/v1/brands/{id}/brand-os/revisions',
  '/v1/brands/{id}/brand-os/revisions/{revisionId}',
  '/v1/brands/{id}/brand-os/scan',
  '/v1/campaigns/{id}',
  '/v1/campaigns/{id}/activations',
  '/v1/campaigns/{id}/performance',
  '/v1/clip-projects/{id}',
  '/v1/clip-projects/{projectId}/highlights',
  '/v1/clip-projects/{projectId}/hook-approval',
  '/v1/clip-results',
  '/v1/clip-results/{id}',
  '/v1/content-intelligence/creators',
  '/v1/content-intelligence/creators/{id}',
  '/v1/content-intelligence/patterns',
  '/v1/content-intelligence/patterns/{id}',
  '/v1/content-intelligence/playbooks',
  '/v1/content-intelligence/playbooks/{id}',
  '/v1/content-learning/accounts',
  '/v1/content-learning/accounts/{credentialId}',
  '/v1/content-learning/accounts/{credentialId}/evidence',
  '/v1/content-learning/decisions/{id}',
  '/v1/content-learning/policies/{id}',
  '/v1/content-learning/posts/{postId}/decision',
  '/v1/content-performance',
  '/v1/content-performance/aggregate/{generationId}',
  '/v1/content-performance/analytics-sync/status',
  '/v1/content-performance/attribution/ranking',
  '/v1/content-performance/attribution/{generationId}',
  '/v1/content-performance/summary/generation-context',
  '/v1/content-performance/summary/prompt-performance',
  '/v1/content-performance/summary/top-performers',
  '/v1/content-performance/summary/weekly',
  '/v1/content-performance/{id}',
  '/v1/content-runs/{id}',
  '/v1/content-runs/{id}/remix',
  '/v1/content/mentions',
  '/v1/contexts',
  '/v1/contexts/{contextId}',
  '/v1/contexts/{contextId}/stats',
  '/v1/costs/workflows',
  '/v1/creative-patterns',
  '/v1/credentials/brand/{brandId}/account-health',
  '/v1/credentials/brand/{brandId}/publishing-readiness',
  '/v1/credentials/mentions',
  '/v1/credentials/{credentialId}/instagram/pages',
  '/v1/credentials/{credentialId}/next-slot',
  '/v1/credentials/{credentialId}/posting-times',
  '/v1/credentials/{credentialId}/publishing-context',
  '/v1/credentials/{credentialId}/quota',
  '/v1/credits/last-purchase-baseline',
  '/v1/credits/transactions',
  '/v1/credits/usage',
  '/v1/dashboard-layouts',
  '/v1/distributions',
  '/v1/distributions/{id}',
  '/v1/editor-projects/{id}',
  '/v1/evaluations/analytics/trends',
  '/v1/font-families',
  '/v1/generation-harness/settings',
  '/v1/gifs/{gifId}',
  '/v1/harness-profiles',
  '/v1/images/{imageId}',
  '/v1/ingredients/batch',
  '/v1/ingredients/{ingredientId}/lineage/made-from',
  '/v1/ingredients/{ingredientId}/lineage/used-in',
  '/v1/insights',
  '/v1/knowledge-sources',
  '/v1/knowledge-sources/eligible-versions',
  '/v1/knowledge-sources/{sourceId}',
  '/v1/knowledge-sources/{sourceId}/versions',
  '/v1/knowledge-sources/{sourceId}/versions/{versionId}',
  '/v1/knowledge-spaces',
  '/v1/knowledge-spaces/{spaceId}',
  '/v1/knowledge-spaces/{spaceId}/memberships',
  '/v1/mcp-approvals',
  '/v1/mcp-approvals/{id}',
  '/v1/members/invitations',
  '/v1/members/{memberId}',
  '/v1/message-campaigns',
  '/v1/message-campaigns/{campaignId}',
  '/v1/message-campaigns/{campaignId}/recipients',
  '/v1/messages/{conversationId}',
  '/v1/messages/{conversationId}/messages',
  '/v1/monitored-accounts/{id}',
  '/v1/mood-boards',
  '/v1/musics/{id}',
  '/v1/newsletters/{id}',
  '/v1/newsletters/{id}/context',
  '/v1/optimizers/history',
  '/v1/organizations/{organizationId}/streaks/me',
  '/v1/organizations/{organizationId}/streaks/me/calendar',
  '/v1/outlier-baselines',
  '/v1/outlier-baselines/configuration',
  '/v1/outlier-baselines/posts',
  '/v1/outlier-baselines/{id}',
  '/v1/outlier-baselines/{id}/posts',
  '/v1/outreach-campaigns/{id}',
  '/v1/outreach-campaigns/{id}/analytics',
  '/v1/outreach-campaigns/{id}/targets',
  '/v1/personas/mentions',
  '/v1/personas/{id}/posts',
  '/v1/post-groups',
  '/v1/post-groups/{id}',
  '/v1/posting-cadences',
  '/v1/presets',
  '/v1/profiles',
  '/v1/profiles/{profileId}',
  '/v1/prompts/{promptId}',
  '/v1/remotion-compositions/{id}',
  '/v1/reply-bot-configs/author-reply/inbox',
  '/v1/reply-bot-configs/{id}',
  '/v1/saved-ads',
  '/v1/schedules/calendar',
  '/v1/services/facebook/pages',
  '/v1/services/google-ads/ad-groups/{id}/insights',
  '/v1/services/google-ads/campaigns',
  '/v1/services/google-ads/campaigns/{id}/metrics',
  '/v1/services/google-ads/customers',
  '/v1/services/google-ads/keywords',
  '/v1/services/google-ads/search-terms/{campaignId}',
  '/v1/services/google-search-console/search-analytics',
  '/v1/services/google-search-console/sites',
  '/v1/services/meta-ads/accounts',
  '/v1/services/meta-ads/ads/{id}/insights',
  '/v1/services/meta-ads/adsets/{id}/insights',
  '/v1/services/meta-ads/bulk/jobs',
  '/v1/services/meta-ads/bulk/jobs/{id}',
  '/v1/services/meta-ads/campaigns',
  '/v1/services/meta-ads/campaigns/compare',
  '/v1/services/meta-ads/campaigns/{id}/insights',
  '/v1/services/meta-ads/creatives',
  '/v1/services/meta-ads/optimization/audit-logs',
  '/v1/services/meta-ads/optimization/config',
  '/v1/services/meta-ads/optimization/recommendations',
  '/v1/services/meta-ads/top-performers',
  '/v1/services/unipile/accounts',
  '/v1/services/unipile/calendar/events',
  '/v1/services/unipile/emails',
  '/v1/services/unipile/messages',
  '/v1/services/unipile/status',
  '/v1/services/whatsapp/status/{messageSid}',
  '/v1/skills/{slug}',
  '/v1/sync/desktop/brand-manifest',
  '/v1/sync/status',
  '/v1/tags/library',
  '/v1/tasks/by-identifier/{identifier}',
  '/v1/tasks/inbox/read-state',
  '/v1/tasks/{id}',
  '/v1/tasks/{id}/children',
  '/v1/tasks/{taskId}/comments',
  '/v1/team/mentions',
  '/v1/templates',
  '/v1/templates/{templateId}',
  '/v1/tracking/content/{contentId}/cta-stats',
  '/v1/tracking/links',
  '/v1/tracking/links/{id}',
  '/v1/tracking/links/{id}/performance',
  '/v1/trainings/{trainingId}',
  '/v1/trainings/{trainingId}/images',
  '/v1/trainings/{trainingId}/sources',
  '/v1/trends',
  '/v1/trends/content',
  '/v1/trends/discovery',
  '/v1/trends/videos',
  '/v1/trends/{id}',
  '/v1/trends/{id}/sources',
  '/v1/users/me',
  '/v1/videos/live-sessions/{sessionId}',
  '/v1/videos/{videoId}',
  '/v1/videos/{videoId}/captions',
  '/v1/videos/{videoId}/posts',
  '/v1/videos/{videoId}/provenance',
  '/v1/videos/{videoId}/provenance/watermark-evaluation',
  '/v1/visual-projects/catalog',
  '/v1/visual-projects/projects',
  '/v1/visual-projects/{id}',
  '/v1/workflow-executions/workflow/{workflowId}/stats',
  '/v1/workflow-executions/{id}',
  '/v1/workflows/most-used',
  '/v1/workflows/{workflowId}',
  '/v1/workflows/{workflowId}/credits-estimate',
  '/v1/workflows/{workflowId}/executions/{runId}/logs',
  '/v1/workflows/{workflowId}/export-comfyui',
  '/v1/workflows/{workflowId}/interface',
  '/v1/workflows/{workflowId}/webhook',
] as const;

describe('combined tenant read policy registry', () => {
  it('conserves exactly248 original canonical routes,74 prefixes and126 distinct owned controllers', () => {
    expect(routes).toHaveLength(248);
    expect(new Set(routes.map((entry) => entry.route)).size).toBe(248);
    expect(new Set(routes.map((entry) => entry.route.split('/')[2])).size).toBe(
      74,
    );
    expect(new Set(routes.map((entry) => entry.controller)).size).toBe(126);
    expect(routes.map((entry) => entry.route).sort()).toEqual(
      [...observedTemplates].sort(),
    );
    expect(cohorts.map((cohort) => cohort.length)).toEqual([54, 61, 133]);
    expect(
      cohorts.map(
        (cohort) => new Set(cohort.map((entry) => entry.controller)).size,
      ),
    ).toEqual([25, 32, 69]);
    const owners = new Map<object, number>();
    cohorts.forEach((cohort, index) => {
      cohort.forEach((entry) => {
        expect(owners.get(entry.controller) ?? index).toBe(index);
        owners.set(entry.controller, index);
        expect(Object.keys(entry).sort()).toEqual([
          'controller',
          'handler',
          'policy',
          'route',
        ]);
      });
    });
  });
  it.each(routes)(
    '$route resolves real GET metadata and exact $policy handler policy',
    (entry) => {
      const handler = actualHandler(entry.controller, entry.handler);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(reflector.get(TENANT_READ_POLICY, handler)).toBe(entry.policy);
      expect(canonicalRoutes(entry.controller, handler)).toContain(entry.route);
    },
  );
  it.each(routes.filter((entry) => entry.policy !== 'selected'))(
    '$route refuses foreign scope before $policy handler but permits original/equal dispatch',
    async (entry) => {
      const handler = actualHandler(entry.controller, entry.handler);
      const next = { handle: vi.fn(() => of('original-handler')) };
      const request = {
        method: 'GET',
        user,
        query: { organizationId: foreignOrg },
      };
      expect(() =>
        interceptor.intercept(
          execution(request, entry.controller, handler),
          next,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(next.handle).not.toHaveBeenCalled();
      for (const query of [{}, { organizationId: user.organizationId }]) {
        expect(
          await firstValueFrom(
            interceptor.intercept(
              execution({ ...request, query }, entry.controller, handler),
              next,
            ),
          ),
        ).toBe('original-handler');
      }
      expect(next.handle).toHaveBeenCalledTimes(2);
    },
  );
  it('keeps persona grants owner-bound without adding it to the248-route repair', async () => {
    const listForPersona = vi.fn();
    const controller = new PersonaGrantsController({
      listForPersona,
    } as unknown as PersonaGrantsService);
    await expect(
      controller.listGrants(user, testId('persona'), foreignOrg),
    ).rejects.toMatchObject({ status: 403 });
    expect(listForPersona).not.toHaveBeenCalled();
    expect(
      routes.some((entry) =>
        Object.is(entry.controller, PersonaGrantsController),
      ),
    ).toBe(false);
  });
});

const machineRoutes = [
  {
    controller: InternalIntegrationsController,
    handler: 'getByPlatform',
    route: '/v1/internal/integrations/{platform}',
  },
  {
    controller: InternalIntegrationsController,
    handler: 'getOneByPlatform',
    route: '/v1/internal/integrations/{platform}/{id}',
  },
  {
    controller: NotificationRuntimeSettingsController,
    handler: 'get',
    route: '/v1/internal/platform-runtime-settings',
  },
  {
    controller: InternalWorkflowExecutionsController,
    handler: 'findOne',
    route: '/v1/internal/orgs/{orgId}/workflow-executions/{id}',
  },
] as const;
describe('four internal machine route authorization boundaries', () => {
  it.each(machineRoutes)(
    '$route retains public hydration bypass plus exact key-only guard and no user scope',
    async (entry) => {
      const handler = actualHandler(entry.controller, entry.handler);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(canonicalRoutes(entry.controller, handler)).toContain(entry.route);
      expect(
        isPublicRoute(reflector, execution({}, entry.controller, handler)),
      ).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, entry.controller)).toContain(
        AdminApiKeyGuard,
      );
      expect(reflector.get(TENANT_READ_POLICY, handler)).toBeUndefined();
      const canActivate = vi.fn();
      const hydrate = vi.fn();
      const logger = { error: vi.fn() } as unknown as LoggerService;
      const guard = new CombinedAuthGuard(
        reflector,
        { canActivate } as unknown as ApiKeyAuthGuard,
        {} as PrismaService,
        logger,
        { canActivate } as unknown as BetterAuthGuard,
        { hydrate } as unknown as RequestContextMiddleware,
      );
      const request = {
        method: 'GET',
        headers: { authorization: 'Bearer synthetic-internal-key' },
        query: {},
        url: entry.route,
      };
      const context = execution(request, entry.controller, handler);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(canActivate).not.toHaveBeenCalled();
      expect(hydrate).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('user');
      expect(request).not.toHaveProperty('context');
      const keyGuard = new AdminApiKeyGuard(
        { get: () => 'synthetic-internal-key' } as unknown as ConfigService,
        logger,
      );
      expect(keyGuard.canActivate(context)).toBe(true);
      for (const authorization of [
        undefined,
        'Bearer synthetic-wrong-key',
        'Bearer synthetic-user-jwt',
      ]) {
        expect(() =>
          keyGuard.canActivate(
            execution(
              { ...request, headers: { authorization } },
              entry.controller,
              handler,
            ),
          ),
        ).toThrow(expect.objectContaining({ status: 401 }));
      }
      const next = {
        handle: vi.fn(() =>
          defer(() => {
            expect(getTenantContext()).toBeUndefined();
            expect(getTenantReadScope()).toBeUndefined();
            return of('machine-no-user-scope');
          }),
        ),
      };
      expect(await firstValueFrom(interceptor.intercept(context, next))).toBe(
        'machine-no-user-scope',
      );
      expect(next.handle).toHaveBeenCalledOnce();
    },
  );
});
