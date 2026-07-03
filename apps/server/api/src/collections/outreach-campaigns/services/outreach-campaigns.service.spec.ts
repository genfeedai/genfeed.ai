import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

describe('OutreachCampaignsService', () => {
  const makeService = () => {
    const prisma = {
      brand: {
        findFirst: vi.fn(),
      },
      credential: {
        findFirst: vi.fn(),
      },
      outreachCampaign: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    return {
      logger,
      prisma,
      service: new OutreachCampaignsService(
        prisma as unknown as PrismaService,
        logger as unknown as LoggerService,
      ),
    };
  };

  it('creates campaigns with auth-scoped owner fields instead of DTO owner overrides', async () => {
    const { prisma, service } = makeService();

    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.credential.findFirst.mockResolvedValue({
      id: 'credential-owned',
      brandId: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.outreachCampaign.create.mockResolvedValue({
      brandId: 'brand-owned',
      config: {
        credential: 'credential-owned',
        label: 'Campaign',
        platform: CampaignPlatform.TWITTER,
      },
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-owned',
      status: 'draft',
      userId: 'user-owned',
    });

    await service.createScoped(
      {
        brand: 'brand-attacker',
        campaignType: CampaignType.MANUAL,
        credential: 'credential-owned',
        label: 'Campaign',
        organization: 'org-attacker',
        platform: CampaignPlatform.TWITTER,
        user: 'user-attacker',
      },
      {
        brandId: 'brand-owned',
        organizationId: 'org-owned',
        userId: 'user-owned',
      },
    );

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        brandId: 'brand-owned',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-owned',
        platform: 'TWITTER',
      }),
    });
    expect(prisma.outreachCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-owned',
        organizationId: 'org-owned',
        userId: 'user-owned',
      }),
    });
  });

  it('rejects credentials outside the authenticated organization and brand scope', async () => {
    const { prisma, service } = makeService();

    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.credential.findFirst.mockResolvedValue(null);

    await expect(
      service.createScoped(
        {
          campaignType: CampaignType.MANUAL,
          credential: 'foreign-credential',
          label: 'Campaign',
          platform: CampaignPlatform.TWITTER,
        },
        {
          brandId: 'brand-owned',
          organizationId: 'org-owned',
          userId: 'user-owned',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('implements BaseCRUD-compatible findOne with legacy _id lookup', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue({
      config: { label: 'Campaign' },
      id: 'campaign-1',
      isDeleted: false,
      mongoId: 'mongo-campaign-1',
      organizationId: 'org-1',
      status: 'draft',
    });

    const campaign = await service.findOne({
      _id: 'mongo-campaign-1',
      isDeleted: false,
      organization: 'org-1',
    });

    expect(prisma.outreachCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'mongo-campaign-1' }, { mongoId: 'mongo-campaign-1' }],
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(campaign?.label).toBe('Campaign');
  });

  it('implements BaseCRUD-compatible remove as a soft delete', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue({
      config: {},
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: 'draft',
    });
    prisma.outreachCampaign.update.mockResolvedValue({
      config: {},
      id: 'campaign-1',
      isDeleted: true,
      organizationId: 'org-1',
      status: 'draft',
    });

    await service.remove('campaign-1');

    expect(prisma.outreachCampaign.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'campaign-1' },
    });
  });
});
