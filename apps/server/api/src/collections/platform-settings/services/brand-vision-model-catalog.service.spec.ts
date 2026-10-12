import { BrandVisionModelCatalogService } from '@api/collections/platform-settings/services/brand-vision-model-catalog.service';
import {
  BRAND_DETECTION_CAPABILITY,
  BRAND_OCR_CAPABILITY,
} from '@genfeedai/contracts/constants';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function row(overrides: Record<string, unknown> = {}) {
  return {
    externalId: 'acme/florence:abc123',
    key: 'acme/florence',
    label: 'Florence',
    pricingType: 'per-second',
    providerCostUsd: 0.000975,
    ...overrides,
  };
}

describe('BrandVisionModelCatalogService', () => {
  const prisma = {
    model: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  let service: BrandVisionModelCatalogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BrandVisionModelCatalogService(prisma as never);
  });

  it('resolves an active platform Replicate row by key and capability', async () => {
    prisma.model.findFirst.mockResolvedValue(row());

    await expect(service.resolve('ocr', ' acme/florence ')).resolves.toEqual({
      externalId: 'acme/florence:abc123',
      key: 'acme/florence',
      label: 'Florence',
      pricingType: 'per-second',
      providerCostUsd: 0.000975,
    });
    expect(prisma.model.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [],
          capabilities: { has: BRAND_OCR_CAPABILITY },
          isActive: true,
          isDeleted: false,
          key: 'acme/florence',
          organizationId: null,
          provider: 'replicate',
        },
      }),
    );
  });

  it('asks for the detection capability for the detector job', async () => {
    prisma.model.findFirst.mockResolvedValue(null);

    await expect(service.resolve('detect', 'acme/owl')).resolves.toBeNull();
    expect(prisma.model.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capabilities: { has: BRAND_DETECTION_CAPABILITY },
        }),
      }),
    );
  });

  it.each([[null], [undefined], ['   ']])(
    'resolves %j to nothing without a query',
    async (key) => {
      await expect(service.resolve('ocr', key)).resolves.toBeNull();
      expect(prisma.model.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['no version', { externalId: null }],
    ['an unpinned identifier', { externalId: 'acme/florence' }],
    ['a version with whitespace', { externalId: 'acme/florence:ab c' }],
    ['a flat price', { pricingType: 'flat' }],
    ['no pricing type', { pricingType: null }],
    ['no price', { providerCostUsd: null }],
    ['a zero price', { providerCostUsd: 0 }],
    ['a non-finite price', { providerCostUsd: Number.NaN }],
  ])('treats a row with %s as unusable', async (_name, overrides) => {
    prisma.model.findFirst.mockResolvedValue(row(overrides));

    await expect(service.resolve('ocr', 'acme/florence')).resolves.toBeNull();
  });

  it('lists the usable rows of each job with their price, skipping unusable ones', async () => {
    prisma.model.findMany.mockImplementation(
      async ({ where }: { where: { capabilities: { has: string } } }) =>
        where.capabilities.has === BRAND_OCR_CAPABILITY
          ? [row(), row({ key: 'acme/unpinned', externalId: null })]
          : [
              row({
                externalId: 'acme/owl:def456',
                key: 'acme/owl',
                label: 'Owl',
                providerCostUsd: 0.000225,
              }),
            ],
    );

    const options = await service.list();

    expect(options.id).toBe('brand-vision-models');
    expect(options.ocr.map((option) => option.key)).toEqual(['acme/florence']);
    expect(options.detect).toEqual([
      {
        externalId: 'acme/owl:def456',
        key: 'acme/owl',
        label: 'Owl',
        pricingType: 'per-second',
        providerCostUsd: 0.000225,
      },
    ]);
  });

  it('passes the CLOUD tenant guard inside a request while staying platform-only', async () => {
    prisma.model.findFirst.mockResolvedValue(row());
    prisma.model.findMany.mockResolvedValue([]);

    await runWithTenantContext({ organizationId: 'org-1' }, async () => {
      await service.resolve('ocr', 'acme/florence');
      await service.list();
    });

    const queries = [
      ...prisma.model.findFirst.mock.calls.map(([args]) => ({
        args,
        operation: 'findFirst',
      })),
      ...prisma.model.findMany.mock.calls.map(([args]) => ({
        args,
        operation: 'findMany',
      })),
    ];
    expect(queries).toHaveLength(3);
    for (const { args, operation } of queries) {
      expect(() =>
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'Model',
          operation,
          tenantModelNames: new Set(['Model']),
        }),
      ).not.toThrow();
      expect(args.where.organizationId).toBeNull();
    }
  });
});
