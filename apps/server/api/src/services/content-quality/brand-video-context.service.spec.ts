import { BrandVideoContextService } from '@api/services/content-quality/brand-video-context.service';
import { describe, expect, it, vi } from 'vitest';

function setup(rows: {
  brand?: { label: string } | null;
  revisions?: unknown[];
}) {
  const prisma = {
    asset: { findFirst: vi.fn().mockResolvedValue(null) },
    brand: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          rows.brand === undefined ? { label: 'Genfeed' } : rows.brand,
        ),
    },
    brandOsRevision: {
      findMany: vi.fn().mockResolvedValue(rows.revisions ?? []),
    },
  };
  const service = new BrandVideoContextService(
    prisma as never,
    { buildUrl: (key: string) => `https://cdn.test/${key}` } as never,
    { warn: vi.fn() } as never,
  );
  return { prisma, service };
}

describe('BrandVideoContextService', () => {
  it('returns nothing without a brand or organization', async () => {
    const { service } = setup({});

    await expect(service.resolve(null, 'org-1')).resolves.toBeUndefined();
    await expect(service.resolve('brand-1', undefined)).resolves.toBeUndefined();
  });

  it('returns nothing for a brand outside the organization', async () => {
    const { service } = setup({ brand: null });

    await expect(service.resolve('brand-1', 'org-1')).resolves.toBeUndefined();
  });

  it('returns the brand name alone when no Brand OS revision is approved', async () => {
    const { service } = setup({ revisions: [] });

    await expect(service.resolve('brand-1', 'org-1')).resolves.toEqual({
      brandName: 'Genfeed',
      rulesText: '',
    });
  });

  it('degrades to no brand context when the approved revision cannot be read', async () => {
    const { service } = setup({
      revisions: [{ content: {}, id: 'rev-1', status: 'APPROVED' }],
    });

    await expect(service.resolve('brand-1', 'org-1')).resolves.toBeUndefined();
  });
});
