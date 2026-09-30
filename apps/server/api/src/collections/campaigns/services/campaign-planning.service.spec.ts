import {
  CampaignPlanningService,
  campaignPlanSchema,
} from '@api/collections/campaigns/services/campaign-planning.service';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignPlanningService', () => {
  const prisma = {
    brand: { findFirst: vi.fn() },
    campaign: { findFirst: vi.fn() },
  };
  const context = { assembleContext: vi.fn(), buildSystemPrompt: vi.fn() };
  const llm = { completeStructured: vi.fn() };
  const campaigns = new CampaignsService(prisma as unknown as PrismaService);
  const createCampaign = vi.spyOn(campaigns, 'create');
  const models = { findOne: vi.fn() };
  const cache = { withLock: vi.fn() };
  const credits = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const dto = {
    brandId: 'brand-1',
    name: '  Product launch  ',
    idempotencyKey: 'request-1',
  };
  const plan = {
    objective: 'Teach the audience',
    brief: 'A practical launch sequence',
  };
  let service: CampaignPlanningService;
  beforeEach(() => {
    vi.resetAllMocks();
    cache.withLock.mockImplementation(
      (_key: string, work: () => Promise<unknown>) => work(),
    );
    models.findOne.mockResolvedValue({ cost: 1, pricingType: 'fixed' });
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(true);
    prisma.brand.findFirst.mockResolvedValue({ id: dto.brandId });
    prisma.campaign.findFirst.mockResolvedValue(null);
    context.assembleContext.mockResolvedValue({
      brandId: dto.brandId,
      brandName: 'Our brand',
    });
    context.buildSystemPrompt.mockReturnValue(
      'Scoped brand voice and guidance',
    );
    llm.completeStructured.mockResolvedValue(plan);
    createCampaign.mockResolvedValue({
      ...plan,
      id: 'campaign-1',
      brandId: dto.brandId,
      name: dto.name.trim(),
      organizationId: 'org-1',
      userId: 'user-1',
      status: ContentCampaignStatus.DRAFT,
      isDeleted: false,
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    });
    service = new CampaignPlanningService(
      prisma as never,
      context as never,
      llm as never,
      campaigns,
      models as never,
      credits as never,
      cache as never,
    );
  });
  it('generates a brand-aware draft from just a name', async () => {
    await service.generate('org-1', 'user-1', dto);
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: dto.brandId, organizationId: 'org-1', isDeleted: false },
    });
    expect(context.assembleContext).toHaveBeenCalledWith({
      brandId: dto.brandId,
      organizationId: 'org-1',
      query: 'Product launch',
    });
    expect(llm.completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ schema: campaignPlanSchema }),
      'org-1',
    );
    expect(campaigns.create).toHaveBeenCalledWith('org-1', 'user-1', {
      ...plan,
      ...dto,
      name: 'Product launch',
      status: ContentCampaignStatus.DRAFT,
    });
  });
  it('does not call AI for unavailable brands', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.generate('org-1', 'user-1', dto)).rejects.toThrow();
    expect(llm.completeStructured).not.toHaveBeenCalled();
    expect(campaigns.create).not.toHaveBeenCalled();
  });
  it('does not fall back to the selected brand when context is missing', async () => {
    context.assembleContext.mockResolvedValue({ brandId: 'other-brand' });
    await expect(service.generate('org-1', 'user-1', dto)).rejects.toThrow();
    expect(llm.completeStructured).not.toHaveBeenCalled();
  });
  it('keeps provider failures retryable without creating an empty campaign', async () => {
    llm.completeStructured.mockRejectedValue(new Error('Provider unavailable'));
    await expect(service.generate('org-1', 'user-1', dto)).rejects.toThrow(
      'Provider unavailable',
    );
    expect(campaigns.create).not.toHaveBeenCalled();
  });
  it('returns an existing campaign on replay without another AI call', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'campaign-1',
      brandId: dto.brandId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.generate('org-1', 'user-1', dto);
    expect(result.id).toBe('campaign-1');
    expect(llm.completeStructured).not.toHaveBeenCalled();
    expect(campaigns.create).not.toHaveBeenCalled();
  });
  it('rejects repeated deleted-key replays before paid work', async () => {
    prisma.campaign.findFirst.mockImplementation(
      async ({ where }: Prisma.CampaignFindFirstArgs) =>
        where?.organizationId === 'org-1' &&
        where.idempotencyKey === dto.idempotencyKey &&
        where.isDeleted === true
          ? { id: 'deleted-campaign', brandId: dto.brandId, isDeleted: true }
          : null,
    );
    const onBilling = vi.fn();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.generate('org-1', 'user-1', dto, onBilling),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('new request key'),
      });
    }
    expect(models.findOne).not.toHaveBeenCalled();
    expect(context.assembleContext).not.toHaveBeenCalled();
    expect(llm.completeStructured).not.toHaveBeenCalled();
    expect(onBilling).not.toHaveBeenCalled();
    expect(campaigns.create).not.toHaveBeenCalled();
  });
  it('does not let another organization’s deleted key block generation', async () => {
    prisma.campaign.findFirst.mockImplementation(
      async ({ where }: Prisma.CampaignFindFirstArgs) =>
        where?.organizationId === 'other-org' && where.isDeleted === true
          ? {
              id: 'foreign-campaign',
              brandId: 'foreign-brand',
              isDeleted: true,
            }
          : null,
    );
    await service.generate('org-1', 'user-1', dto);
    expect(llm.completeStructured).toHaveBeenCalledTimes(1);
    for (const [query] of prisma.campaign.findFirst.mock.calls) {
      expect(query.where.organizationId).toBe('org-1');
    }
  });
  it('allows a fresh key after deletion without reviving the old campaign', async () => {
    prisma.campaign.findFirst.mockImplementation(
      async ({ where }: Prisma.CampaignFindFirstArgs) =>
        where?.idempotencyKey === dto.idempotencyKey && where.isDeleted === true
          ? { id: 'deleted-campaign', brandId: dto.brandId, isDeleted: true }
          : null,
    );
    await service.generate('org-1', 'user-1', {
      ...dto,
      idempotencyKey: 'fresh-key',
    });
    expect(llm.completeStructured).toHaveBeenCalledTimes(1);
    expect(campaigns.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({ idempotencyKey: 'fresh-key' }),
    );
  });
  it.each([false, true])(
    'does not replay a different brand’s key (deleted: %s)',
    async (isDeleted) => {
      prisma.campaign.findFirst.mockImplementation(
        async ({ where }: Prisma.CampaignFindFirstArgs) =>
          where?.isDeleted === isDeleted
            ? { id: 'other-brand-campaign', brandId: 'other-brand', isDeleted }
            : null,
      );
      await expect(
        service.generate('org-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(
        isDeleted ? ConflictException : BadRequestException,
      );
      expect(llm.completeStructured).not.toHaveBeenCalled();
      expect(campaigns.create).not.toHaveBeenCalled();
    },
  );
  it('rejects blank ideas before calling AI', async () => {
    await expect(
      service.generate('org-1', 'user-1', { ...dto, name: '   ' }),
    ).rejects.toThrow();
    expect(llm.completeStructured).not.toHaveBeenCalled();
  });
  it('bounds generated text to campaign storage limits', () => {
    expect(
      campaignPlanSchema.safeParse({ objective: '', brief: 'ok' }).success,
    ).toBe(false);
    expect(
      campaignPlanSchema.safeParse({ objective: 'ok', brief: 'x'.repeat(8001) })
        .success,
    ).toBe(false);
  });
  it('does not call AI when the organization has no credits', async () => {
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(false);
    credits.getOrganizationCreditsBalance.mockResolvedValue(0);
    await expect(service.generate('org-1', 'user-1', dto)).rejects.toThrow();
    expect(llm.completeStructured).not.toHaveBeenCalled();
    expect(campaigns.create).not.toHaveBeenCalled();
  });
  it('does not call AI when a matching request is already in progress', async () => {
    cache.withLock.mockResolvedValue(null);
    await expect(service.generate('org-1', 'user-1', dto)).rejects.toThrow(
      'busy',
    );
    expect(llm.completeStructured).not.toHaveBeenCalled();
  });
});
