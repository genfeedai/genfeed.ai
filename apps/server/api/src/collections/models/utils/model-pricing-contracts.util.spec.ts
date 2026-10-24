import {
  loadCurrentPricingContracts,
  PRICING_CONTRACT_SELECT,
} from '@api/collections/models/utils/model-pricing-contracts.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function contract(modelId: string, version: string) {
  return { modelId, pricing: {}, version };
}

function prismaReturning(rows: ReturnType<typeof contract>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return {
    findMany,
    prisma: { modelProviderContract: { findMany } } as unknown as PrismaService,
  };
}

describe('loadCurrentPricingContracts', () => {
  it('queries only the reviewed and pending versions of the given models', async () => {
    const { findMany, prisma } = prismaReturning([]);

    await loadCurrentPricingContracts(prisma, [
      {
        id: 'a',
        pendingProviderContractVersion: 'a-v3',
        reviewedProviderContractVersion: 'a-v2',
      },
      {
        id: 'b',
        pendingProviderContractVersion: null,
        reviewedProviderContractVersion: 'b-v9',
      },
    ]);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      select: PRICING_CONTRACT_SELECT,
      where: {
        modelId: { in: ['a', 'b'] },
        version: { in: ['a-v2', 'a-v3', 'b-v9'] },
      },
    });
  });

  it('never selects the heavy provider document columns', () => {
    expect(PRICING_CONTRACT_SELECT).not.toHaveProperty('openapi');
    expect(PRICING_CONTRACT_SELECT).not.toHaveProperty('inputSchema');
    expect(PRICING_CONTRACT_SELECT).not.toHaveProperty('outputSchema');
  });

  it('does not query at all when no model has a reviewed or pending version', async () => {
    const { findMany, prisma } = prismaReturning([]);

    const contracts = await loadCurrentPricingContracts(prisma, [
      {
        id: 'a',
        pendingProviderContractVersion: null,
        reviewedProviderContractVersion: null,
      },
    ]);

    expect(findMany).not.toHaveBeenCalled();
    expect(contracts.size).toBe(0);
  });

  it('keeps only the exact model and version pairs', async () => {
    // `a` reviews v2 and `b` reviews v1: the cross pairs a/v1 and b/v2 match the
    // superset filter but are not either model's current contract.
    const { prisma } = prismaReturning([
      contract('a', 'v2'),
      contract('a', 'v1'),
      contract('b', 'v1'),
      contract('b', 'v2'),
    ]);

    const contracts = await loadCurrentPricingContracts(prisma, [
      {
        id: 'a',
        pendingProviderContractVersion: null,
        reviewedProviderContractVersion: 'v2',
      },
      {
        id: 'b',
        pendingProviderContractVersion: null,
        reviewedProviderContractVersion: 'v1',
      },
    ]);

    expect(contracts.get('a')).toEqual([contract('a', 'v2')]);
    expect(contracts.get('b')).toEqual([contract('b', 'v1')]);
  });
});
