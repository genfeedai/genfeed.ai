vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: () => 'testMethod' },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import type {
  AdsGatewayAdapterContextInput,
  AdsGatewayRequestContextService,
} from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import type { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('AdsGatewayWriteController', () => {
  let controller: AdsGatewayWriteController;
  let logs: string[];
  // Every provider write that actually reached an adapter.
  let providerWrites: Record<string, unknown>[];

  const user = {
    id: 'user_authProvider_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const contextFields = {
    adAccountId: 'act-123',
    credentialId: testId('credential'),
    loginCustomerId: 'login-customer-123',
  };
  // The adapter context the request-context service resolves for this user,
  // platform and credential selection.
  const contextFor = (platform: string) => ({
    ...contextFields,
    accessToken: `token:${platform}`,
    organizationId: user.organizationId,
  });

  beforeEach(() => {
    logs = [];
    providerWrites = [];

    // Each adapter answers with what it was asked to write and where.
    const adapterFor = (platform: string) => {
      const write =
        (operation: string) =>
        async (...args: unknown[]) => {
          const entry = { args, operation, platform };
          providerWrites.push(entry);
          return entry;
        };
      return {
        createAd: write('createAd'),
        createAdSet: write('createAdSet'),
        createCampaign: write('createCampaign'),
        updateCampaign: write('updateCampaign'),
      };
    };
    const requestContext = {
      createAdapterContext: async (
        requestUser: User,
        platform: AdsPlatform,
        fields: AdsGatewayAdapterContextInput,
      ) => ({
        ...fields,
        accessToken: `token:${platform}`,
        organizationId: requestUser.organizationId,
      }),
      validatePlatform: (platform: AdsPlatform) => platform,
    };

    controller = new AdsGatewayWriteController(
      { getAdapter: adapterFor } as unknown as AdsGatewayService,
      requestContext as unknown as AdsGatewayRequestContextService,
      {
        log: (message: string) => logs.push(message),
      } as unknown as LoggerService,
    );
  });

  it('creates a campaign on the requested platform with the stripped input', async () => {
    const input = {
      dailyBudget: 25,
      name: 'Launch',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['NONE'],
      status: 'PAUSED',
    };

    await expect(
      controller.createCampaign(user, 'meta', { ...contextFields, ...input }),
    ).resolves.toEqual({
      args: [contextFor('meta'), input],
      operation: 'createCampaign',
      platform: 'meta',
    });
    expect(logs).toEqual(['AdsGatewayController testMethod started for meta']);
  });

  it('updates the named campaign with the stripped input', async () => {
    const input = { lifetimeBudget: 300, name: 'Renamed', status: 'PAUSED' };

    await expect(
      controller.updateCampaign(user, 'google', 'campaign-1', {
        ...contextFields,
        ...input,
      }),
    ).resolves.toEqual({
      args: [contextFor('google'), 'campaign-1', input],
      operation: 'updateCampaign',
      platform: 'google',
    });
  });

  it('creates an ad set with the stripped input', async () => {
    const input = {
      campaignId: 'campaign-1',
      dailyBudget: 15,
      name: 'Prospecting',
      optimizationGoal: 'CLICKS',
      targeting: { countries: ['MT'] },
    };

    await expect(
      controller.createAdSet(user, 'tiktok', { ...contextFields, ...input }),
    ).resolves.toEqual({
      args: [contextFor('tiktok'), input],
      operation: 'createAdSet',
      platform: 'tiktok',
    });
  });

  it('creates an ad with the stripped input', async () => {
    const input = {
      adSetId: 'adset-1',
      creative: {
        body: 'Ship it',
        callToAction: 'LEARN_MORE',
        linkUrl: 'https://genfeed.ai',
        title: 'Genfeed',
      },
      name: 'Launch ad',
    };

    await expect(
      controller.createAd(user, 'x', { ...contextFields, ...input }),
    ).resolves.toEqual({
      args: [contextFor('x'), input],
      operation: 'createAd',
      platform: 'x',
    });
  });

  it('refuses to activate a campaign before any provider write', async () => {
    await expect(
      controller.createCampaign(user, 'meta', {
        ...contextFields,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(providerWrites).toEqual([]);
  });
});
