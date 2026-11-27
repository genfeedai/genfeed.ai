import { AdWatchedAdvertisersController } from '@api/collections/ad-watched-advertisers/controllers/ad-watched-advertisers.controller';
import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import type { ExecutionContext, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

type Handler = (...args: never[]) => unknown;

type Route = {
  controller: Type<unknown>;
  handler: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
};

/** What a scan finds is open to every organization: the scan limit is the gate. */
const OPEN_ROUTES: Route[] = [
  { controller: TrendsController, handler: 'refreshTrends', method: 'POST' },
  {
    controller: AdsResearchController,
    handler: 'pollWatchedAdvertiser',
    method: 'POST',
  },
  {
    controller: AdsResearchController,
    handler: 'generateAdPack',
    method: 'POST',
  },
  {
    controller: AdsResearchController,
    handler: 'createRemixWorkflow',
    method: 'POST',
  },
  { controller: SavedAdsController, handler: 'save', method: 'POST' },
  { controller: SavedAdsController, handler: 'updateNotes', method: 'PATCH' },
  { controller: SavedAdsController, handler: 'unsave', method: 'DELETE' },
  {
    controller: AdWatchedAdvertisersController,
    handler: 'create',
    method: 'POST',
  },
  {
    controller: AdWatchedAdvertisersController,
    handler: 'patch',
    method: 'PATCH',
  },
  {
    controller: AdWatchedAdvertisersController,
    handler: 'remove',
    method: 'DELETE',
  },
];

/** Launch prep stays a plan's work. */
const GATED_ROUTES: Route[] = [
  {
    controller: AdsResearchController,
    handler: 'prepareCampaignForReview',
    method: 'POST',
  },
];

const reflector = new Reflector();

function guardForOrganizationWithoutPlan() {
  const access = new OrganizationModuleAccessService(
    {
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
      organizationSetting: {
        findUnique: vi.fn().mockResolvedValue({ id: 'settings-1' }),
      },
    } as never,
    { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(true) } as never,
    {
      getFeatureSettingsState: async () => ({
        isResolved: true,
        settings: { flags: {} },
      }),
    } as never,
  );
  return new OrganizationModuleGuard(reflector, access);
}

function contextFor({ controller, handler, method }: Route): ExecutionContext {
  const prototype = controller.prototype as Record<string, Handler>;
  return {
    getClass: () => controller,
    getHandler: () => prototype[handler],
    switchToHttp: () => ({
      getRequest: () => ({
        body: {},
        context: { organizationId: 'org-1' },
        method,
        user: { id: 'user-1', organizationId: 'org-1' },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('routes behind a scan limit instead of a plan (#11623)', () => {
  it.each(OPEN_ROUTES)(
    '$controller.name.$handler admits an organization without a plan',
    async (route) => {
      await expect(
        guardForOrganizationWithoutPlan().canActivate(contextFor(route)),
      ).resolves.toBe(true);
    },
  );

  it.each(OPEN_ROUTES)(
    '$controller.name.$handler still belongs to the Discovery module',
    ({ controller, handler }) => {
      const prototype = controller.prototype as Record<string, Handler>;
      expect(
        reflector.getAllAndOverride<OrganizationModuleEndpointPolicy>(
          ORGANIZATION_MODULE_KEY,
          [prototype[handler], controller],
        ),
      ).toMatchObject({ moduleId: 'discovery' });
    },
  );

  it.each(GATED_ROUTES)(
    '$controller.name.$handler still needs a plan',
    async (route) => {
      await expect(
        guardForOrganizationWithoutPlan().canActivate(contextFor(route)),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED',
        }),
        status: 403,
      });
    },
  );
});
