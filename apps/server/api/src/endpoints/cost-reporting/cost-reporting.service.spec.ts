import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { CostReportingService } from './cost-reporting.service';

describe('CostReportingService', () => {
  const prisma = {
    $queryRaw: vi.fn(),
    brand: {
      findFirst: vi.fn(),
    },
  };
  const service = new CostReportingService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns organization totals with separate provider cost and credits', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          brandId: 'brand-1',
          brandLabel: 'Acme',
          byokCount: 1n,
          creditsUsed: 18.5,
          generationCount: 3n,
          llmCount: 2n,
          mediaCount: 1n,
          providerCostMicros: 2_750_000n,
        },
        {
          brandId: null,
          brandLabel: 'Unattributed',
          byokCount: 0n,
          creditsUsed: 4,
          generationCount: 1n,
          llmCount: 0n,
          mediaCount: 1n,
          providerCostMicros: 250_000n,
        },
      ])
      .mockResolvedValueOnce([
        {
          byokCount: 1n,
          creditsUsed: 22.5,
          date: '2026-08-20',
          generationCount: 4n,
          providerCostMicros: 3_000_000n,
        },
      ]);

    const result = await service.getSummary('org-1', {
      from: '2026-08-20',
      to: '2026-08-20',
    });

    expect(result.total).toEqual({
      byokCount: 1,
      creditsUsed: 22.5,
      generationCount: 4,
      llmCount: 2,
      mediaCount: 2,
      providerCostMicros: 3_000_000,
      providerCostUsd: 3,
    });
    expect(result.byBrand).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        brandLabel: 'Acme',
        providerCostUsd: 2.75,
      }),
      expect.objectContaining({
        brandId: null,
        brandLabel: 'Unattributed',
      }),
    ]);
    expect(result.daily).toEqual([
      expect.objectContaining({
        date: '2026-08-20',
        providerCostUsd: 3,
      }),
    ]);
  });

  it('rejects a brand outside the authenticated organization', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);

    await expect(
      service.getSummary('org-1', {
        brandId: 'brand-from-another-org',
        from: '2026-08-01',
        to: '2026-08-02',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'brand-from-another-org',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns a newest-first normalized ledger with pagination metadata', async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    prisma.$queryRaw.mockResolvedValue([
      {
        brandId: 'brand-1',
        brandLabel: 'Acme',
        category: 'image',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        creditsUsed: 0,
        entryType: 'media',
        id: 'media-1',
        isByok: false,
        model: 'flux-schnell',
        provider: 'replicate',
        providerCostMicros: 125_000n,
        referenceId: 'ingredient-1',
        totalCount: 3n,
      },
    ]);

    const result = await service.getEntries('org-1', {
      brandId: 'brand-1',
      from: '2026-08-20',
      limit: 1,
      skip: 1,
      to: '2026-08-20',
    });

    expect(result).toEqual({
      docs: [
        expect.objectContaining({
          entryType: 'media',
          providerCostMicros: 125_000,
          providerCostUsd: 0.125,
        }),
      ],
      limit: 1,
      skip: 1,
      total: 3,
    });
  });
});
