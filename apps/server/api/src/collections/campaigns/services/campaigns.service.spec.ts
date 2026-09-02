import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentCampaignStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const BRAND_ID = 'cbrand0000001';
const OTHER_BRAND_ID = 'cbrand0000002';
const CAMPAIGN_ID = 'ccampaign0001';
const USER_ID = 'legacy-base62-user-id';

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND_ID,
    brief: 'One brief, many releases',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    id: CAMPAIGN_ID,
    idempotencyKey: null,
    isDeleted: false,
    name: 'Q4 launch',
    objective: 'Fill the pipeline',
    organizationId: ORG_ID,
    startDate: null,
    status: ContentCampaignStatus.DRAFT,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

function asMock(fn: unknown) {
  return fn as ReturnType<typeof vi.fn>;
}

describe('CampaignsService', () => {
  const prisma = {
    brand: { findFirst: vi.fn() },
    campaign: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    post: { findMany: vi.fn(), updateMany: vi.fn() },
  } as unknown as PrismaService;
  let service: CampaignsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new CampaignsService(prisma);
    asMock(prisma.brand.findFirst).mockResolvedValue({ id: BRAND_ID });
  });

  it('scopes the list to the organization, brand and tombstone state', async () => {
    asMock(prisma.campaign.findMany).mockResolvedValue([campaignRow()]);
    asMock(prisma.campaign.count).mockResolvedValue(1);

    const result = await service.list(ORG_ID, {
      brandId: BRAND_ID,
      isDeleted: false,
      limit: 10,
      page: 1,
      sort: 'createdAt: -1',
      status: ContentCampaignStatus.DRAFT,
    });

    expect(asMock(prisma.campaign.findMany).mock.calls[0][0].where).toEqual({
      brandId: BRAND_ID,
      isDeleted: false,
      organizationId: ORG_ID,
      status: ContentCampaignStatus.DRAFT,
    });
    expect(result.docs).toEqual([
      expect.objectContaining({ id: CAMPAIGN_ID, organizationId: ORG_ID }),
    ]);
    expect(result.totalDocs).toBe(1);
  });

  it('never reads a campaign owned by another organization', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(null);

    await expect(
      service.getOne(OTHER_ORG_ID, CAMPAIGN_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(asMock(prisma.campaign.findFirst).mock.calls[0][0].where).toEqual({
      id: CAMPAIGN_ID,
      isDeleted: false,
      organizationId: OTHER_ORG_ID,
    });
  });

  it('returns the existing winner when an idempotent create races', async () => {
    const winner = campaignRow({ idempotencyKey: 'replay-1' });
    asMock(prisma.campaign.create).mockRejectedValue({ code: 'P2002' });
    asMock(prisma.campaign.findFirst).mockResolvedValue(winner);

    const result = await service.create(ORG_ID, USER_ID, {
      brandId: BRAND_ID,
      idempotencyKey: 'replay-1',
      name: 'Q4 launch',
    });

    expect(result.id).toBe(CAMPAIGN_ID);
    expect(asMock(prisma.campaign.findFirst).mock.calls[0][0].where).toEqual({
      idempotencyKey: 'replay-1',
      isDeleted: false,
      organizationId: ORG_ID,
    });
  });

  it('rethrows a unique violation that carries no idempotency key', async () => {
    asMock(prisma.campaign.create).mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(ORG_ID, USER_ID, { brandId: BRAND_ID, name: 'Q4 launch' }),
    ).rejects.toEqual({ code: 'P2002' });
    expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a create whose brand belongs to another organization', async () => {
    asMock(prisma.brand.findFirst).mockResolvedValue(null);

    await expect(
      service.create(ORG_ID, USER_ID, {
        brandId: OTHER_BRAND_ID,
        name: 'Q4 launch',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it('soft deletes without touching posts or releases', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.campaign.update).mockResolvedValue(
      campaignRow({ isDeleted: true }),
    );

    const result = await service.remove(ORG_ID, CAMPAIGN_ID);

    expect(asMock(prisma.campaign.update).mock.calls[0][0]).toEqual({
      data: { isDeleted: true },
      where: { id: CAMPAIGN_ID, isDeleted: false, organizationId: ORG_ID },
    });
    expect(result.isDeleted).toBe(true);
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });

  it('rejects assigning a post that belongs to another brand', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.post.findMany).mockResolvedValue([{ id: 'cpost00000001' }]);

    await expect(
      service.assignPosts(ORG_ID, CAMPAIGN_ID, {
        postIds: ['cpost00000001', 'cpost00000002'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(asMock(prisma.post.findMany).mock.calls[0][0].where).toEqual({
      brandId: BRAND_ID,
      id: { in: ['cpost00000001', 'cpost00000002'] },
      isDeleted: false,
      organizationId: ORG_ID,
    });
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });

  it('assigns and unassigns in-scope posts by campaign id', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.post.findMany).mockResolvedValue([{ id: 'cpost00000001' }]);
    asMock(prisma.post.updateMany).mockResolvedValue({ count: 1 });

    await service.assignPosts(ORG_ID, CAMPAIGN_ID, {
      postIds: ['cpost00000001'],
    });
    await service.unassignPosts(ORG_ID, CAMPAIGN_ID, {
      postIds: ['cpost00000001'],
    });

    expect(asMock(prisma.post.updateMany).mock.calls[0][0]).toEqual({
      data: { campaignId: CAMPAIGN_ID },
      where: {
        brandId: BRAND_ID,
        id: { in: ['cpost00000001'] },
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
    expect(asMock(prisma.post.updateMany).mock.calls[1][0]).toEqual({
      data: { campaignId: null },
      where: {
        brandId: BRAND_ID,
        campaignId: CAMPAIGN_ID,
        id: { in: ['cpost00000001'] },
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });

  it('archives and restores through the org-scoped status write', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.campaign.update)
      .mockResolvedValueOnce(
        campaignRow({ status: ContentCampaignStatus.ARCHIVED }),
      )
      .mockResolvedValueOnce(
        campaignRow({ status: ContentCampaignStatus.DRAFT }),
      );

    const archived = await service.archive(ORG_ID, CAMPAIGN_ID);
    const restored = await service.restore(ORG_ID, CAMPAIGN_ID);

    expect(archived.status).toBe(ContentCampaignStatus.ARCHIVED);
    expect(restored.status).toBe(ContentCampaignStatus.DRAFT);
    expect(asMock(prisma.campaign.update).mock.calls[0][0]).toEqual({
      data: { status: ContentCampaignStatus.ARCHIVED },
      where: { id: CAMPAIGN_ID, isDeleted: false, organizationId: ORG_ID },
    });
    expect(asMock(prisma.campaign.update).mock.calls[1][0]).toEqual({
      data: { status: ContentCampaignStatus.DRAFT },
      where: { id: CAMPAIGN_ID, isDeleted: false, organizationId: ORG_ID },
    });
  });
});
