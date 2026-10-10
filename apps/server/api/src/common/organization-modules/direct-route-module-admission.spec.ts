import { AdWatchedAdvertisersController } from '@api/collections/ad-watched-advertisers/controllers/ad-watched-advertisers.controller';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { CreatorsController } from '@api/collections/content-intelligence/controllers/creators.controller';
import { GenerateController } from '@api/collections/content-intelligence/controllers/generate.controller';
import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import { BrandRemixGenerationController } from '@api/collections/content-runs/controllers/brand-remix-generation.controller';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { EngagementRulesController } from '@api/collections/engagement-rules/controllers/engagement-rules.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialTimelineController } from '@api/collections/social-sources/controllers/social-timeline.controller';
import { SocialWarmupEnrollmentsController } from '@api/collections/social-warmup-enrollments/controllers/social-warmup-enrollments.controller';
import { SourcePostsController } from '@api/collections/source-posts/controllers/source-posts.controller';
import { SpeechController } from '@api/collections/speech/controllers/speech.controller';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { RequestMethod, type ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

const surfaces = [
  { controller: ContentOptimizationController, moduleId: 'analytics' },
  { controller: CredentialsPublishingController, moduleId: 'publishing' },
  { controller: AssetsOperationsController, moduleId: 'playground' },
  { controller: EngagementRulesController, moduleId: 'publishing' },
  { controller: SocialWarmupEnrollmentsController, moduleId: 'publishing' },
  { controller: ProfilesController, moduleId: 'playground' },
  { controller: CampaignsController, moduleId: 'publishing' },
  { controller: MonitoredAccountsController, moduleId: 'discovery' },
  { controller: SocialTimelineController, moduleId: 'discovery' },
  { controller: CreatorsController, moduleId: 'discovery' },
  { controller: PatternsController, moduleId: 'discovery' },
  { controller: GenerateController, moduleId: 'playground' },
  { controller: ListeningTopicsController, moduleId: 'analytics' },
  { controller: SpeechController, moduleId: 'playground' },
  { controller: OptimizersController, moduleId: 'playground' },
  { controller: SourcePostsController, moduleId: 'discovery' },
  { controller: BrandRemixGenerationController, moduleId: 'playground' },
  { controller: ContentRunsController, moduleId: 'playground' },
  { controller: ArticlesTransformationsController, moduleId: 'playground' },
  { controller: ImagesResizeController, moduleId: 'playground' },
  { controller: NewslettersController, moduleId: 'publishing' },
  { controller: AdWatchedAdvertisersController, moduleId: 'discovery' },
] as const;

const reflector = new Reflector();
function context(
  controller: object,
  handler: object,
  method: string,
  flags: Record<string, boolean> = {},
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: { id: 'user-1', organizationId: 'org-1', ...flags },
        context: { organizationId: 'org-1' },
        body: { moduleId: 'playground', moduleOverrides: { discovery: true } },
      }),
    }),
  } as unknown as ExecutionContext;
}

/** Real route metadata, not fixture controllers: removing a decorator reopens admission. */
describe('direct product route module admission inventory', () => {
  it.each(surfaces)(
    '$controller.name owns $moduleId at the HTTP boundary',
    ({ controller, moduleId }) => {
      expect(
        reflector.get<OrganizationModuleEndpointPolicy>(
          ORGANIZATION_MODULE_KEY,
          controller,
        ),
      ).toMatchObject({ moduleId });
    },
  );

  it.each(surfaces)(
    '$controller.name denies new work before route effects for disabled or unresolved settings',
    async ({ controller }) => {
      const prisma = {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const access = new OrganizationModuleAccessService(
        prisma as never,
        {
          isSubscriptionGatedFresh: vi.fn().mockResolvedValue(true),
        } as never,
      );
      const guard = new OrganizationModuleGuard(reflector, access);
      const handlers = Object.getOwnPropertyNames(controller.prototype).flatMap(
        (name) => {
          const handler: unknown = Reflect.get(controller.prototype, name);
          if (typeof handler !== 'function') return [];
          const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
          if (
            typeof method !== 'number' ||
            !Object.hasOwn(RequestMethod, method)
          )
            return [];
          const policy =
            reflector.getAllAndOverride<OrganizationModuleEndpointPolicy>(
              ORGANIZATION_MODULE_KEY,
              [handler, controller],
            );
          return [{ handler, method, policy }];
        },
      );
      expect(handlers.length).toBeGreaterThan(0);
      for (const { handler, method, policy } of handlers) {
        const operation =
          policy?.operation ??
          (method === RequestMethod.GET ? 'read' : 'write');
        for (const flags of [{}, { isApiKey: true }, { isSuperAdmin: true }]) {
          const request = context(
            controller,
            handler,
            RequestMethod[method as RequestMethod],
            flags,
          );
          if (operation === 'write') {
            await expect(guard.canActivate(request)).rejects.toMatchObject({
              status: 503,
            });
            prisma.organizationSetting.findUnique.mockResolvedValueOnce({
              moduleOverrides: {
                publishing: false,
                analytics: false,
                discovery: false,
              },
            });
            if (
              policy &&
              ['publishing', 'analytics', 'discovery'].includes(policy.moduleId)
            ) {
              await expect(guard.canActivate(request)).rejects.toMatchObject({
                status: 403,
              });
            } else {
              await expect(guard.canActivate(request)).resolves.toBe(true);
            }
          } else {
            await expect(guard.canActivate(request)).resolves.toBe(true);
          }
        }
      }
    },
  );

  it('requires Playground admission on legacy MCP video writes, including keys and admins, without gating saved reads', async () => {
    const assertAccess = vi.fn().mockRejectedValue(new Error('unavailable'));
    const guard = new OrganizationModuleGuard(reflector, {
      assertAccess,
    } as never);
    for (const flags of [{}, { isApiKey: true }, { isSuperAdmin: true }]) {
      await expect(
        guard.canActivate(
          context(
            MCPController,
            MCPController.prototype.createVideo,
            'POST',
            flags,
          ),
        ),
      ).rejects.toThrow('unavailable');
      expect(assertAccess).toHaveBeenLastCalledWith(
        'org-1',
        'playground',
        'write',
      );
    }
    assertAccess.mockClear();
    await expect(
      guard.canActivate(
        context(MCPController, MCPController.prototype.getAnalytics, 'GET'),
      ),
    ).resolves.toBe(true);
    expect(assertAccess).not.toHaveBeenCalled();
  });

  it('marks inbox read and campaign pause as saved-data recovery rather than new work', async () => {
    const assertAccess = vi.fn().mockResolvedValue(undefined);
    const guard = new OrganizationModuleGuard(reflector, {
      assertAccess,
    } as never);
    await guard.canActivate(
      context(
        SocialInboxController,
        SocialInboxController.prototype.markConversationRead,
        'PATCH',
      ),
    );
    expect(assertAccess).toHaveBeenLastCalledWith('org-1', 'messages', 'read');
    await guard.canActivate(
      context(CampaignsController, CampaignsController.prototype.pause, 'POST'),
    );
    expect(assertAccess).toHaveBeenLastCalledWith(
      'org-1',
      'publishing',
      'cancel',
    );
  });
});
