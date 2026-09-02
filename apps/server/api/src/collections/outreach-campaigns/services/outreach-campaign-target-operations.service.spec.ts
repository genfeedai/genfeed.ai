import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignTargetOperationsService } from '@api/collections/outreach-campaigns/services/outreach-campaign-target-operations.service';
import type { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  CampaignDiscoveryService,
  DiscoveredTarget,
} from '@api/services/campaign/campaign-discovery.service';
import type { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignTargetStatus,
  CampaignTargetType,
  CampaignType,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

describe('OutreachCampaignTargetOperationsService', () => {
  const organizationId = 'org_1';
  const user = {
    brandId: 'brand_1',
    id: 'user_1',
    organizationId,
    userId: 'user_1',
  } as User;
  const campaignsService = {
    findOneById: vi.fn(),
  };
  const targetsService = {
    createManyForCampaign: vi.fn(),
    findByCampaign: vi.fn(),
    findById: vi.fn(),
    findExistingExternalIds: vi.fn(),
  };
  const discoveryService = {
    addDiscoveredTargetsToCampaign: vi.fn(),
    discoverTargets: vi.fn(),
  };
  const executorService = {
    previewReply: vi.fn(),
  };
  const service = new OutreachCampaignTargetOperationsService(
    targetsService as unknown as CampaignTargetsService,
    discoveryService as unknown as CampaignDiscoveryService,
    executorService as unknown as CampaignExecutorService,
    campaignsService as unknown as OutreachCampaignsService,
  );
  const executableCampaign = {
    campaignType: CampaignType.MANUAL,
    discoveryConfig: {
      excludeAuthors: [],
      hashtags: [],
      keywords: ['genfeed'],
      maxAgeHours: 24,
      maxEngagement: 1000,
      minEngagement: 0,
      minRelevanceScore: 0,
      subreddits: [],
    },
    id: 'campaign_1',
    organizationId,
    platform: CampaignPlatform.TWITTER,
  } as unknown as OutreachCampaignDocument;
  const unavailableCampaign = {
    ...executableCampaign,
    platform: CampaignPlatform.REDDIT,
  } as OutreachCampaignDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    campaignsService.findOneById.mockResolvedValue(executableCampaign);
    targetsService.createManyForCampaign.mockResolvedValue(0);
    targetsService.findExistingExternalIds.mockResolvedValue(new Set());
  });

  it('preserves the campaign not-found category after the scoped lookup', async () => {
    campaignsService.findOneById.mockResolvedValue(null);

    await expect(service.getTargets('missing', user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(campaignsService.findOneById).toHaveBeenCalledWith(
      'missing',
      organizationId,
      user.brandId,
    );
    expect(targetsService.findByCampaign).not.toHaveBeenCalled();
  });

  describe('addTargets', () => {
    it('normalizes, deduplicates, looks up once, and inserts URL targets once', async () => {
      targetsService.findExistingExternalIds.mockResolvedValue(new Set(['2']));
      targetsService.createManyForCampaign.mockResolvedValue(1);

      await expect(
        service.addTargets('campaign_1', user, {
          urls: [
            'https://x.com/genfeedai/status/1',
            'https://twitter.com/genfeedai/status/1',
            'not-a-url',
            'https://x.com/genfeedai/status/2',
          ],
        }),
      ).resolves.toEqual({ added: 1, skipped: 3 });

      expect(campaignsService.findOneById).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
        user.brandId,
      );
      expect(targetsService.findExistingExternalIds).toHaveBeenCalledOnce();
      expect(targetsService.findExistingExternalIds).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
        ['1', '2'],
      );
      expect(targetsService.createManyForCampaign).toHaveBeenCalledOnce();
      expect(targetsService.createManyForCampaign).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
        [
          {
            campaignId: 'campaign_1',
            contentUrl: 'https://x.com/genfeedai/status/1',
            discoverySource: CampaignDiscoverySource.MANUAL,
            externalId: '1',
            organizationId,
            platform: CampaignPlatform.TWITTER,
            targetType: CampaignTargetType.TWEET,
          },
        ],
      );
    });

    it('normalizes DM usernames and preserves duplicate skip behavior', async () => {
      campaignsService.findOneById.mockResolvedValue({
        ...executableCampaign,
        campaignType: CampaignType.DM_OUTREACH,
      });
      targetsService.findExistingExternalIds.mockResolvedValue(
        new Set(['bob']),
      );
      targetsService.createManyForCampaign.mockResolvedValue(1);

      await expect(
        service.addTargets('campaign_1', user, {
          targetType: CampaignTargetType.DM_RECIPIENT,
          usernames: [' @Alice ', 'alice', '', '@Bob'],
        }),
      ).resolves.toEqual({ added: 1, skipped: 1 });

      expect(targetsService.findExistingExternalIds).toHaveBeenCalledOnce();
      expect(targetsService.findExistingExternalIds).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
        ['alice', 'bob'],
      );
      expect(targetsService.createManyForCampaign).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
        [
          {
            campaignId: 'campaign_1',
            contentUrl: 'https://x.com/alice',
            discoverySource: CampaignDiscoverySource.MANUAL,
            externalId: 'alice',
            organizationId,
            platform: CampaignPlatform.TWITTER,
            recipientUsername: 'alice',
            status: CampaignTargetStatus.PENDING,
            targetType: CampaignTargetType.DM_RECIPIENT,
          },
        ],
      );
    });

    it('preserves the DM campaign validation category before persistence', async () => {
      await expect(
        service.addTargets('campaign_1', user, {
          targetType: CampaignTargetType.DM_RECIPIENT,
          usernames: ['alice'],
        }),
      ).rejects.toThrow('Campaign is not a DM outreach campaign');
      expect(targetsService.findExistingExternalIds).not.toHaveBeenCalled();
      expect(targetsService.createManyForCampaign).not.toHaveBeenCalled();
    });

    it('rejects unavailable capability before target persistence', async () => {
      campaignsService.findOneById.mockResolvedValue(unavailableCampaign);

      await expect(
        service.addTargets('campaign_1', user, {
          urls: ['https://x.com/genfeedai/status/1'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(targetsService.findExistingExternalIds).not.toHaveBeenCalled();
      expect(targetsService.createManyForCampaign).not.toHaveBeenCalled();
    });

    it('rejects a mismatched target platform before target persistence', async () => {
      await expect(
        service.addTargets('campaign_1', user, {
          urls: ['https://reddit.com/r/test/comments/abc123/title'],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'outreach_capability.target_platform_mismatch',
        }),
      });

      expect(targetsService.findExistingExternalIds).not.toHaveBeenCalled();
      expect(targetsService.createManyForCampaign).not.toHaveBeenCalled();
    });
  });

  describe('parseUrl', () => {
    it('preserves valid and invalid response shapes', () => {
      expect(service.parseUrl('not-a-url')).toEqual({ valid: false });
      expect(service.parseUrl('https://x.com/genfeedai/status/123')).toEqual({
        externalId: '123',
        platform: CampaignPlatform.TWITTER,
        targetType: CampaignTargetType.TWEET,
        valid: true,
      });
    });
  });

  describe('getTargets', () => {
    it('uses the campaign tenant returned by the scoped lookup', async () => {
      const targets = [{ id: 'target_1' }];
      targetsService.findByCampaign.mockResolvedValue(targets);

      await expect(service.getTargets('campaign_1', user)).resolves.toBe(
        targets,
      );
      expect(targetsService.findByCampaign).toHaveBeenCalledWith(
        'campaign_1',
        organizationId,
      );
    });
  });

  describe('discoverTargets', () => {
    const discoveredTargets = [
      {
        externalId: 'target_1',
      } as DiscoveredTarget,
    ];

    it('defaults the discovery limit to 50 and returns unpersisted targets', async () => {
      discoveryService.discoverTargets.mockResolvedValue(discoveredTargets);

      await expect(
        service.discoverTargets('campaign_1', user, {}),
      ).resolves.toEqual({
        added: 0,
        discovered: 1,
        targets: discoveredTargets,
      });
      expect(discoveryService.discoverTargets).toHaveBeenCalledWith(
        executableCampaign,
        50,
      );
      expect(
        discoveryService.addDiscoveredTargetsToCampaign,
      ).not.toHaveBeenCalled();
    });

    it('persists discovered targets and omits them from the response when requested', async () => {
      discoveryService.discoverTargets.mockResolvedValue(discoveredTargets);
      discoveryService.addDiscoveredTargetsToCampaign.mockResolvedValue(1);

      await expect(
        service.discoverTargets('campaign_1', user, {
          addToCampaign: true,
          limit: 10,
        }),
      ).resolves.toEqual({ added: 1, discovered: 1, targets: [] });
      expect(
        discoveryService.addDiscoveredTargetsToCampaign,
      ).toHaveBeenCalledWith(executableCampaign, discoveredTargets);
    });

    it('rejects unavailable capability before provider access', async () => {
      campaignsService.findOneById.mockResolvedValue(unavailableCampaign);

      await expect(
        service.discoverTargets('campaign_1', user, { limit: 10 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(discoveryService.discoverTargets).not.toHaveBeenCalled();
      expect(
        discoveryService.addDiscoveredTargetsToCampaign,
      ).not.toHaveBeenCalled();
    });

    it('preserves the missing discovery configuration error before provider access', async () => {
      campaignsService.findOneById.mockResolvedValue({
        ...executableCampaign,
        discoveryConfig: undefined,
      });

      await expect(
        service.discoverTargets('campaign_1', user, {}),
      ).rejects.toThrow(
        'Campaign has no discovery configuration. Add keywords, hashtags, or subreddits first.',
      );
      expect(discoveryService.discoverTargets).not.toHaveBeenCalled();
    });
  });

  describe('previewReply', () => {
    it('rejects unavailable capability before target access or generation', async () => {
      campaignsService.findOneById.mockResolvedValue(unavailableCampaign);

      await expect(
        service.previewReply('campaign_1', 'target_1', user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(targetsService.findById).not.toHaveBeenCalled();
      expect(executorService.previewReply).not.toHaveBeenCalled();
    });

    it('preserves the target not-found category before generation', async () => {
      targetsService.findById.mockResolvedValue(null);

      await expect(
        service.previewReply('campaign_1', 'missing', user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(executorService.previewReply).not.toHaveBeenCalled();
    });

    it('loads the target in campaign scope before generating a reply', async () => {
      const target = { id: 'target_1' };
      targetsService.findById.mockResolvedValue(target);
      executorService.previewReply.mockResolvedValue('Hello');

      await expect(
        service.previewReply('campaign_1', 'target_1', user),
      ).resolves.toEqual({ replyText: 'Hello', target });
      expect(targetsService.findById).toHaveBeenCalledWith(
        'target_1',
        organizationId,
        'campaign_1',
      );
      expect(executorService.previewReply).toHaveBeenCalledWith(
        executableCampaign,
        target,
      );
    });
  });
});
