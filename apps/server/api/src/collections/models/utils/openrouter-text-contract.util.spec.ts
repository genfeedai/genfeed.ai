import { openrouterTextContractFixture } from '@api/collections/models/utils/openrouter-text-contract.fixture';
import { findReviewedOpenRouterTextContract as read } from '@api/collections/models/utils/openrouter-text-contract.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const contract = openrouterTextContractFixture();
  const { kind: _kind, version: _version, ...content } = contract.snapshot;
  const row = {
    ...content,
    version: contract.version,
    reviewedAt: new Date(contract.reviewedAt),
    reviewStatus: 'approved',
    mappingStatus: 'supported',
  };
  const model = {
    id: 'synthetic-model',
    key: 'synthetic/text-model',
    provider: 'synthetic-vendor',
    endpoint: 'synthetic/text-model',
    isActive: true,
    isDeleted: false,
    isFree: false,
    reviewedProviderContractVersion: contract.version,
    providerContracts: [row],
  };
  const findFirst = vi.fn().mockResolvedValue(model);
  return {
    contract,
    row,
    model,
    findFirst,
    prisma: { model: { findFirst } } as unknown as PrismaService,
  };
}
describe('private reviewed OpenRouter text contract reader', () => {
  it('selects exact owning vendor row with separately pinned OpenRouter transport and exposes no public pricing', async () => {
    const f = fixture();
    expect(await read(f.prisma, f.model.key, 'org-1')).toEqual({
      status: 'reviewed',
      contract: f.contract,
    });
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: f.model.key,
          isDeleted: false,
          OR: [{ organizationId: 'org-1' }, { organizationId: null }],
        },
      }),
    );
  });
  it.each([
    { reviewStatus: 'pending' },
    { mappingStatus: 'quarantined' },
    { reviewedAt: null },
    { provider: 'synthetic-vendor' },
    { endpoint: 'alias/text-model' },
    { modelId: 'foreign-model' },
    { version: '0'.repeat(64) },
  ])('rejects pointer/transport/ownership drift %#', async (patch) => {
    const f = fixture();
    Object.assign(f.row, patch);
    expect(await read(f.prisma, f.model.key)).toMatchObject({
      status: 'unresolved',
    });
  });
  it('rejects changed content, extra descriptor fields, unsupported bounds and scalar projections', async () => {
    for (const patch of [
      {
        pricing: {
          ...openrouterTextContractFixture().snapshot.pricing,
          requestUsdCeiling: 10,
        },
      },
      {
        openapi: {
          ...openrouterTextContractFixture().snapshot.openapi,
          extra: true,
        },
      },
      {
        openapi: {
          ...openrouterTextContractFixture().snapshot.openapi,
          maximumCompletionTokens: 10000,
        },
      },
      { unitPrice: '1' },
    ]) {
      const f = fixture();
      Object.assign(f.row, patch);
      expect(await read(f.prisma, f.model.key)).toMatchObject({
        status: 'unresolved',
      });
    }
  });
  it('does not approve a generic free flag, alias endpoint, or another catalog provider', async () => {
    for (const patch of [
      { provider: 'foreign-vendor' },
      { endpoint: 'alias/model' },
      { isDeleted: true },
      { isActive: false },
    ]) {
      const f = fixture();
      Object.assign(f.model, patch);
      expect(await read(f.prisma, f.model.key)).toMatchObject({
        status: 'unresolved',
      });
    }
  });
  it('allows unavailable pricing as capability evidence but propagates storage uncertainty', async () => {
    const f = fixture();
    f.findFirst.mockRejectedValue(new Error('storage unavailable'));
    await expect(read(f.prisma, f.model.key)).rejects.toThrow(
      'storage unavailable',
    );
  });
});
