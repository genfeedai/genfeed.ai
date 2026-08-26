vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import type { AdsAdapterContext, AdsPlatform } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';

describe('AdsGatewayWriteController', () => {
  let controller: AdsGatewayWriteController;
  let adapter: {
    createAd: ReturnType<typeof vi.fn>;
    createAdSet: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };
  let adsGatewayService: { getAdapter: ReturnType<typeof vi.fn> };
  let requestContextService: {
    createAdapterContext: ReturnType<typeof vi.fn>;
    validatePlatform: ReturnType<typeof vi.fn>;
  };
  let logger: { log: ReturnType<typeof vi.fn> };

  const user = {
    id: 'user_authProvider_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const context = {
    accessToken: 'access-token',
    adAccountId: 'act-123',
    credentialId: testId('credential'),
    loginCustomerId: 'login-customer-123',
    organizationId: testId('org'),
  } satisfies AdsAdapterContext;
  const contextFields = {
    adAccountId: context.adAccountId,
    credentialId: context.credentialId,
    loginCustomerId: context.loginCustomerId,
  };

  beforeEach(() => {
    adapter = {
      createAd: vi.fn(),
      createAdSet: vi.fn(),
      createCampaign: vi.fn(),
      updateCampaign: vi.fn(),
    };
    adsGatewayService = {
      getAdapter: vi.fn().mockReturnValue(adapter),
    };
    requestContextService = {
      createAdapterContext: vi.fn().mockResolvedValue(context),
      validatePlatform: vi.fn((platform: AdsPlatform) => platform),
    };
    logger = { log: vi.fn() };
    controller = new AdsGatewayWriteController(
      adsGatewayService as unknown as AdsGatewayService,
      requestContextService as unknown as AdsGatewayRequestContextService,
      logger as unknown as LoggerService,
    );
  });

  it('delegates createCampaign with the exact input and adapter context', async () => {
    const result = { id: 'campaign-1' };
    adapter.createCampaign.mockResolvedValue(result);

    await expect(
      controller.createCampaign(user, 'meta', {
        ...contextFields,
        dailyBudget: 25,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['NONE'],
        status: 'PAUSED',
      }),
    ).resolves.toBe(result);

    expect(requestContextService.createAdapterContext).toHaveBeenCalledWith(
      user,
      'meta',
      contextFields,
    );
    expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('meta');
    expect(adapter.createCampaign).toHaveBeenCalledWith(context, {
      dailyBudget: 25,
      name: 'Launch',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['NONE'],
      status: 'PAUSED',
    });
    expect(logger.log).toHaveBeenCalledWith(
      'AdsGatewayController testMethod started for meta',
    );
  });

  it('delegates updateCampaign with the exact campaign id and input', async () => {
    const result = { id: 'campaign-1' };
    adapter.updateCampaign.mockResolvedValue(result);

    await expect(
      controller.updateCampaign(user, 'google', 'campaign-1', {
        ...contextFields,
        lifetimeBudget: 300,
        name: 'Renamed',
        status: 'PAUSED',
      }),
    ).resolves.toBe(result);

    expect(requestContextService.createAdapterContext).toHaveBeenCalledWith(
      user,
      'google',
      contextFields,
    );
    expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('google');
    expect(adapter.updateCampaign).toHaveBeenCalledWith(context, 'campaign-1', {
      lifetimeBudget: 300,
      name: 'Renamed',
      status: 'PAUSED',
    });
  });

  it('delegates createAdSet with the exact input', async () => {
    const result = { id: 'adset-1' };
    adapter.createAdSet.mockResolvedValue(result);

    await expect(
      controller.createAdSet(user, 'tiktok', {
        ...contextFields,
        campaignId: 'campaign-1',
        dailyBudget: 15,
        name: 'Prospecting',
        optimizationGoal: 'CLICKS',
        targeting: { countries: ['MT'] },
      }),
    ).resolves.toBe(result);

    expect(requestContextService.createAdapterContext).toHaveBeenCalledWith(
      user,
      'tiktok',
      contextFields,
    );
    expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('tiktok');
    expect(adapter.createAdSet).toHaveBeenCalledWith(context, {
      campaignId: 'campaign-1',
      dailyBudget: 15,
      name: 'Prospecting',
      optimizationGoal: 'CLICKS',
      targeting: { countries: ['MT'] },
    });
  });

  it('delegates createAd with the exact input', async () => {
    const result = { id: 'ad-1' };
    adapter.createAd.mockResolvedValue(result);
    const creative = {
      body: 'Ship it',
      callToAction: 'LEARN_MORE',
      linkUrl: 'https://genfeed.ai',
      title: 'Genfeed',
    };

    await expect(
      controller.createAd(user, 'x', {
        ...contextFields,
        adSetId: 'adset-1',
        creative,
        name: 'Launch ad',
      }),
    ).resolves.toBe(result);

    expect(requestContextService.createAdapterContext).toHaveBeenCalledWith(
      user,
      'x',
      contextFields,
    );
    expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('x');
    expect(adapter.createAd).toHaveBeenCalledWith(context, {
      adSetId: 'adset-1',
      creative,
      name: 'Launch ad',
    });
  });
});
