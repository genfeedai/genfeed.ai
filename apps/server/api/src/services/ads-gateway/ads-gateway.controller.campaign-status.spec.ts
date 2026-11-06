vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { testId } from '@helpers/testing/test-id.helper';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: () => ({
    organizationId: 'corg000000000000000000001',
    userId: 'cuser000000000000000000001',
  }),
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: () => 'testMethod' },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { INVALID_CAMPAIGN_STATUS_MESSAGE } from '@api/services/ads-gateway/ads-campaign-status.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AdsGatewayWriteController paused-only campaign writes', () => {
  let controller: AdsGatewayWriteController;
  // Campaigns on the fake ad platform, by id.
  let campaigns: Map<string, Record<string, unknown>>;
  // Every credential read or adapter lookup the controller made.
  let touched: string[];

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
    campaigns = new Map([
      ['campaign-1', { name: 'Existing', status: 'PAUSED' }],
    ]);
    touched = [];

    const adapter = {
      createCampaign: async (
        _context: unknown,
        input: Record<string, unknown>,
      ) => {
        campaigns.set('campaign-new', { ...input });
        return { id: 'campaign-new' };
      },
      updateCampaign: async (
        _context: unknown,
        id: string,
        input: Record<string, unknown>,
      ) => {
        campaigns.set(id, { ...campaigns.get(id), ...input });
        return { id };
      },
    };
    const credentialsService = {
      findOne: async () => {
        touched.push('credential');
        return { accessToken: 'token-abc' };
      },
      async findOneSelect() {
        return this.findOne();
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsGatewayWriteController],
      providers: [
        {
          provide: AdsGatewayService,
          useValue: {
            comparePlatforms: () => undefined,
            getAdapter: (platform: string) => {
              touched.push(`adapter:${platform}`);
              return adapter;
            },
          },
        },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: { log: () => undefined } },
        AdsGatewayRequestContextService,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdsGatewayWriteController>(
      AdsGatewayWriteController,
    );
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
      ).rejects.toThrow(INVALID_CAMPAIGN_STATUS_MESSAGE);

      expect(touched).toEqual([]);
      expect(campaigns.has('campaign-new')).toBe(false);
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
      ).rejects.toThrow(INVALID_CAMPAIGN_STATUS_MESSAGE);

      expect(touched).toEqual([]);
      expect(campaigns.get('campaign-1')).toEqual({
        name: 'Existing',
        status: 'PAUSED',
      });
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

    expect(campaigns.get('campaign-new')).toMatchObject({
      name: 'Launch',
      status: 'PAUSED',
    });
  });

  it('accepts an omitted status on create', async () => {
    await expect(
      controller.createCampaign(mockUser, 'meta', {
        ...baseBody,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
      }),
    ).resolves.toBeDefined();

    expect(campaigns.get('campaign-new')).toMatchObject({ name: 'Launch' });
  });

  it('accepts a budget-only update with no status', async () => {
    await expect(
      controller.updateCampaign(mockUser, 'meta', 'campaign-1', {
        ...baseBody,
        dailyBudget: 25,
      }),
    ).resolves.toBeDefined();

    expect(campaigns.get('campaign-1')).toMatchObject({
      dailyBudget: 25,
      status: 'PAUSED',
    });
  });

  it('rejects an unknown platform before validating the status', async () => {
    await expect(
      controller.createCampaign(mockUser, 'snapchat', {
        ...baseBody,
        name: 'Launch',
        objective: 'OUTCOME_TRAFFIC',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(
      'Invalid platform: snapchat. Must be one of: meta, google, tiktok, x',
    );

    expect(touched).toEqual([]);
  });
});
