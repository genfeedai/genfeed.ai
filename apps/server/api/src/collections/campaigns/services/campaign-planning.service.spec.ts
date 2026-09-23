import {
  CampaignPlanningService,
  campaignPlanSchema,
} from '@api/collections/campaigns/services/campaign-planning.service';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignPlanningService', () => {
  const prisma = {
    brand: { findFirst: vi.fn() },
    campaign: { findFirst: vi.fn() },
  };
  const context = { assembleContext: vi.fn(), buildSystemPrompt: vi.fn() };
  const llm = { completeStructured: vi.fn() };
  const campaigns = { create: vi.fn() };
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
    campaigns.create.mockResolvedValue({ id: 'campaign-1', ...plan });
    service = new CampaignPlanningService(
      prisma as never,
      context as never,
      llm as never,
      campaigns as never,
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
