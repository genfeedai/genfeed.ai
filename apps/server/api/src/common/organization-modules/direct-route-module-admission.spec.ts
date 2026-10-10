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
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import { VideosLiveSessionsController } from '@api/collections/videos/controllers/live-sessions/videos-live-sessions.controller';
import { VideosClipChainController } from '@api/collections/videos/controllers/transformations/clip-chain/videos-clip-chain.controller';
import { VideosEditsController } from '@api/collections/videos/controllers/transformations/edits/videos-edits.controller';
import { VideosEffectsController } from '@api/collections/videos/controllers/transformations/effects/videos-effects.controller';
import { VideosExtendController } from '@api/collections/videos/controllers/transformations/extend/videos-extend.controller';
import { VideosGifController } from '@api/collections/videos/controllers/transformations/gif/videos-gif.controller';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { VideosReframeController } from '@api/collections/videos/controllers/transformations/reframe/videos-reframe.controller';
import { VideosResizeController } from '@api/collections/videos/controllers/transformations/resize/videos-resize.controller';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { type ExecutionContext, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

const creditVideoSurfaces = [
  { controller: VideosExtendController, moduleId: 'playground' },
  { controller: VideosUpscaleController, moduleId: 'playground' },
  { controller: VideosReframeController, moduleId: 'playground' },
  { controller: VideosLipSyncController, moduleId: 'playground' },
  { controller: VideosClipChainController, moduleId: 'playground' },
  { controller: VideosEditsController, moduleId: 'playground' },
  { controller: VideosEffectsController, moduleId: 'playground' },
  { controller: VideosResizeController, moduleId: 'playground' },
  { controller: VideosGifController, moduleId: 'playground' },
  { controller: BatchInterpolationController, moduleId: 'storyboard' },
] as const;

const surfaces = [
  ...creditVideoSurfaces,
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
  flags: { isApiKey?: boolean; isSuperAdmin?: boolean } = {},
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

  it.each(creditVideoSurfaces)(
    '$controller.name admits credit work without a subscription or optional Studio module',
    async ({ controller, moduleId }) => {
      const isSubscriptionGatedFresh = vi.fn().mockResolvedValue(true);
      const access = new OrganizationModuleAccessService(
        {
          organization: {
            findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }),
          },
          organizationSetting: {
            findUnique: vi.fn().mockResolvedValue({
              moduleOverrides: {
                motion: false,
                clips: false,
                batch: false,
                editor: false,
              },
            }),
          },
        } as never,
        { isSubscriptionGatedFresh } as never,
      );
      const guard = new OrganizationModuleGuard(reflector, access);
      expect(
        reflector.get<unknown[]>(GUARDS_METADATA, controller) ?? [],
      ).not.toContain(SubscriptionGuard);
      const handlers = Object.getOwnPropertyNames(controller.prototype).flatMap(
        (name) => {
          const handler: unknown = Reflect.get(controller.prototype, name);
          if (
            typeof handler !== 'function' ||
            Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.POST
          )
            return [];
          return [handler];
        },
      );
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect(
          reflector.get<unknown[]>(GUARDS_METADATA, handler) ?? [],
        ).not.toContain(SubscriptionGuard);
        expect(
          reflector.getAllAndOverride<OrganizationModuleEndpointPolicy>(
            ORGANIZATION_MODULE_KEY,
            [handler, controller],
          ),
        ).toMatchObject({ moduleId });
        for (const flags of [{}, { isApiKey: true }, { isSuperAdmin: true }]) {
          await expect(
            guard.canActivate(context(controller, handler, 'POST', flags)),
          ).resolves.toBe(true);
        }
      }
      expect(isSubscriptionGatedFresh).not.toHaveBeenCalled();
    },
  );

  it('admits only live-session creation through Playground and keeps saved reads and termination recoverable', async () => {
    const controller = VideosLiveSessionsController;
    const openSession = controller.prototype.openSession;
    expect(reflector.get(ORGANIZATION_MODULE_KEY, controller)).toBeUndefined();
    expect(
      reflector.get<unknown[]>(GUARDS_METADATA, controller) ?? [],
    ).not.toContain(SubscriptionGuard);
    expect(
      reflector.get<unknown[]>(GUARDS_METADATA, openSession) ?? [],
    ).not.toContain(SubscriptionGuard);
    expect(
      reflector.getAllAndOverride<OrganizationModuleEndpointPolicy>(
        ORGANIZATION_MODULE_KEY,
        [openSession, controller],
      ),
    ).toMatchObject({ moduleId: 'playground' });

    const isSubscriptionGatedFresh = vi.fn().mockResolvedValue(true);
    const creditAccess = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: vi.fn().mockResolvedValue({
            moduleOverrides: { motion: false },
          }),
        },
      } as never,
      { isSubscriptionGatedFresh } as never,
    );
    await expect(
      new OrganizationModuleGuard(reflector, creditAccess).canActivate(
        context(controller, openSession, 'POST'),
      ),
    ).resolves.toBe(true);
    expect(isSubscriptionGatedFresh).not.toHaveBeenCalled();

    const assertAccess = vi.fn().mockRejectedValue(new Error('unavailable'));
    const guard = new OrganizationModuleGuard(reflector, {
      assertAccess,
    } as never);
    for (const flags of [{}, { isApiKey: true }, { isSuperAdmin: true }]) {
      await expect(
        guard.canActivate(context(controller, openSession, 'POST', flags)),
      ).rejects.toThrow('unavailable');
      expect(assertAccess).toHaveBeenLastCalledWith(
        'org-1',
        'playground',
        'write',
      );
      assertAccess.mockClear();
      for (const { handler, method } of [
        { handler: controller.prototype.getSession, method: 'GET' },
        { handler: controller.prototype.terminateSession, method: 'POST' },
      ]) {
        expect(
          reflector.getAllAndOverride<OrganizationModuleEndpointPolicy>(
            ORGANIZATION_MODULE_KEY,
            [handler, controller],
          ),
        ).toBeUndefined();
        expect(
          reflector.get<unknown[]>(GUARDS_METADATA, handler) ?? [],
        ).not.toContain(SubscriptionGuard);
        await expect(
          guard.canActivate(context(controller, handler, method, flags)),
        ).resolves.toBe(true);
      }
      expect(assertAccess).not.toHaveBeenCalled();
    }
  });

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
