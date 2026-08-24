vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { testId } from '@helpers/testing/test-id.helper';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: vi.fn(() => ({
    organizationId: 'corg000000000000000000001',
    userId: 'cuser000000000000000000001',
  })),
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AdsGatewayController paused-only campaign writes', () => {
  let controller: AdsGatewayController;
  let adsGatewayService: {
    comparePlatforms: ReturnType<typeof vi.fn>;
    getAdapter: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let mockAdapter: {
    createCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_authProvider_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const baseBody = {
    adAccountId: 'act_12345',
    credentialId: testId('credential'),
  };

  beforeEach(async () => {
    mockAdapter = {
      createCampaign: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
      updateCampaign: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
    };

    adsGatewayService = {
      comparePlatforms: vi.fn(),
      getAdapter: vi.fn().mockReturnValue(mockAdapter),
    };

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ accessToken: 'token-abc' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsGatewayController],
      providers: [
        { provide: AdsGatewayService, useValue: adsGatewayService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: { log: vi.fn() } },
      ],
    }).compile();

    controller = module.get<AdsGatewayController>(AdsGatewayController);
  });

  const ACTIVATING_STATUSES = [
    'ACTIVE',
    'active',
    'paused',
    'Paused',
    'ENABLE',
    '',
  ];

  it.each(ACTIVATING_STATUSES)(
    'rejects createCampaign with status "%s" before any credential or adapter work',
    async (status) => {
      await expect(
        controller.createCampaign(mockUser, 'meta', {
          ...baseBody,
          name: 'Launch',
          objective: 'OUTCOME_TRAFFIC',
          status,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(credentialsService.findOne).not.toHaveBeenCalled();
      expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
      expect(mockAdapter.createCampaign).not.toHaveBeenCalled();
    },
  );

  it.each(ACTIVATING_STATUSES)(
    'rejects updateCampaign with status "%s" before any credential or adapter work',
    async (status) => {
      await expect(
        controller.updateCampaign(mockUser, 'meta', 'campaign-1', {
          ...baseBody,
          status,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(credentialsService.findOne).not.toHaveBeenCalled();
      expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
      expect(mockAdapter.updateCampaign).not.toHaveBeenCalled();
    },
  );

  it('accepts an explicit PAUSED status on create', async () => {
    await expect(
      controller.createCampaign(mockUser, 'meta', {
        ...baseBody,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
      }),
    ).resolves.toBeDefined();

    expect(mockAdapter.createCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'PAUSED' }),
    );
  });

  it('accepts an omitted status on create', async () => {
    await expect(
      controller.createCampaign(mockUser, 'meta', {
        ...baseBody,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
      }),
    ).resolves.toBeDefined();

    expect(mockAdapter.createCampaign).toHaveBeenCalled();
  });

  it('accepts a budget-only update with no status', async () => {
    await expect(
      controller.updateCampaign(mockUser, 'meta', 'campaign-1', {
        ...baseBody,
        dailyBudget: 25,
      }),
    ).resolves.toBeDefined();

    expect(mockAdapter.updateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'campaign-1',
      expect.objectContaining({ dailyBudget: 25 }),
    );
  });

  it('rejects an unknown platform before validating the status', async () => {
    await expect(
      controller.createCampaign(mockUser, 'snapchat', {
        ...baseBody,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(credentialsService.findOne).not.toHaveBeenCalled();
  });
});
