import { CampaignPaidActivationService } from '@api/collections/campaigns/services/campaign-paid-activation.service';
import { UNIFIED_PAUSED_CAMPAIGN_STATUS } from '@api/services/ads-gateway/ads-campaign-status.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignPaidActivationStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const CAMPAIGN_ID = 'ccampaign0001';
const USER = {
  id: 'session-id',
  organizationId: ORG_ID,
  userId: 'legacy-base62-user-id',
} as never;

function asMock(fn: unknown) {
  return fn as ReturnType<typeof vi.fn>;
}

describe('CampaignPaidActivationService', () => {
  const prisma = {
    campaign: { findFirst: vi.fn() },
    campaignPaidActivation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    post: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const adapter = {
    createAd: vi.fn(),
    createAdSet: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
  };
  const adsGateway = { getAdapter: vi.fn(() => adapter) };
  const requestContext = {
    createAdapterContext: vi.fn(),
    validatePlatform: vi.fn((platform: string) => platform),
  };
  let service: CampaignPaidActivationService;

  beforeEach(() => {
    vi.resetAllMocks();
    adsGateway.getAdapter.mockReturnValue(adapter);
    requestContext.validatePlatform.mockImplementation(
      (platform: string) => platform,
    );
    requestContext.createAdapterContext.mockResolvedValue({
      accessToken: 'token',
      adAccountId: 'act-1',
      credentialId: 'ccred00000001',
      organizationId: ORG_ID,
    });
    service = new CampaignPaidActivationService(
      prisma,
      adsGateway as never,
      requestContext as never,
    );
  });

  it('blocks unapproved posts before any provider write', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      brandId: 'cbrand0000001',
      id: CAMPAIGN_ID,
      name: 'Q4',
      objective: null,
    });
    asMock(prisma.post.findMany).mockResolvedValue([]);

    await expect(
      service.prepare(ORG_ID, USER, CAMPAIGN_ID, {
        adAccountId: 'act-1',
        credentialId: 'ccred00000001',
        platform: 'meta',
        postIds: ['cpost00000001'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(adapter.createCampaign).not.toHaveBeenCalled();
  });

  it('creates paused provider resources and never calls updateCampaign', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      brandId: 'cbrand0000001',
      id: CAMPAIGN_ID,
      name: 'Q4',
      objective: 'Reach',
    });
    asMock(prisma.post.findMany).mockResolvedValue([
      {
        id: 'cpost00000001',
        reviewDecision: PersistedReviewDecision.APPROVED,
        url: 'https://genfeed.ai/p/1',
      },
    ]);
    asMock(prisma.campaignPaidActivation.findFirst).mockResolvedValue(null);
    adapter.createCampaign.mockResolvedValue({ id: 'ext-camp' });
    adapter.createAdSet.mockResolvedValue({ id: 'ext-set' });
    adapter.createAd.mockResolvedValue({ id: 'ext-ad' });
    asMock(prisma.campaignPaidActivation.create).mockResolvedValue({
      adAccountId: 'act-1',
      campaignId: CAMPAIGN_ID,
      credentialId: 'ccred00000001',
      externalAdId: 'ext-ad',
      externalAdSetId: 'ext-set',
      externalCampaignId: 'ext-camp',
      id: 'cact000000001',
      platform: 'meta',
      postIds: ['cpost00000001'],
      spendApprovedAt: null,
      status: ContentCampaignPaidActivationStatus.PAUSED,
    });

    const result = await service.prepare(ORG_ID, USER, CAMPAIGN_ID, {
      adAccountId: 'act-1',
      credentialId: 'ccred00000001',
      platform: 'meta',
      postIds: ['cpost00000001'],
    });

    expect(adapter.createCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: UNIFIED_PAUSED_CAMPAIGN_STATUS }),
    );
    expect(adapter.updateCampaign).not.toHaveBeenCalled();
    expect(result.status).toBe(ContentCampaignPaidActivationStatus.PAUSED);
    expect(result.externalCampaignId).toBe('ext-camp');
  });

  it('reuses an existing paused activation instead of duplicating provider resources', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      brandId: 'cbrand0000001',
      id: CAMPAIGN_ID,
      name: 'Q4',
    });
    asMock(prisma.post.findMany).mockResolvedValue([
      {
        id: 'cpost00000001',
        reviewDecision: PersistedReviewDecision.APPROVED,
        url: 'https://genfeed.ai/p/1',
      },
    ]);
    asMock(prisma.campaignPaidActivation.findFirst).mockResolvedValue({
      adAccountId: 'act-1',
      campaignId: CAMPAIGN_ID,
      credentialId: 'ccred00000001',
      id: 'cact000000001',
      platform: 'meta',
      postIds: ['cpost00000001'],
      spendApprovedAt: null,
      status: ContentCampaignPaidActivationStatus.PAUSED,
    });

    const result = await service.prepare(ORG_ID, USER, CAMPAIGN_ID, {
      adAccountId: 'act-1',
      credentialId: 'ccred00000001',
      idempotencyKey: 'act-1-key',
      platform: 'meta',
      postIds: ['cpost00000001'],
    });

    expect(adapter.createCampaign).not.toHaveBeenCalled();
    expect(result.id).toBe('cact000000001');
  });

  it('records spend approval without activating provider spend', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      id: CAMPAIGN_ID,
    });
    asMock(prisma.campaignPaidActivation.findFirst).mockResolvedValue({
      id: 'cact000000001',
      spendApprovedAt: null,
      status: ContentCampaignPaidActivationStatus.PAUSED,
    });
    asMock(prisma.campaignPaidActivation.updateMany).mockResolvedValue({
      count: 1,
    });

    const result = await service.approveSpend(
      ORG_ID,
      'legacy-base62-user-id',
      CAMPAIGN_ID,
      'cact000000001',
      { confirm: 'confirm' },
    );

    expect(adapter.updateCampaign).not.toHaveBeenCalled();
    expect(prisma.campaignPaidActivation.updateMany).toHaveBeenCalledWith({
      data: {
        spendApprovedAt: expect.any(Date),
        spendApprovedByUserId: 'legacy-base62-user-id',
      },
      where: {
        id: 'cact000000001',
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
    expect(result.status).toBe(ContentCampaignPaidActivationStatus.PAUSED);
    expect(result.spendApprovedAt).not.toBeNull();
  });
});
