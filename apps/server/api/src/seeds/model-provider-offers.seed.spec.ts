import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';
import {
  seedProviderOfferAssociations,
  seedProviderOfferRegistrations,
} from './model-provider-offers.seed';

function fixture() {
  const prisma = {
    providerRoutingSetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ provider: 'kie', isActive: false }),
      create: vi.fn(),
    },
    model: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi
        .fn()
        .mockResolvedValue({ key: 'kie/kling-3.0', isActive: false }),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    modelProviderOffer: { findUnique: vi.fn(), create: vi.fn() },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return { prisma, client: prisma as unknown as PrismaService };
}
describe('model provider reference-data sync', () => {
  it('preserves provider kill switches and inactive registrations without writes', async () => {
    const f = fixture();
    await expect(seedProviderOfferRegistrations(f.client)).resolves.toBe(0);
    expect(f.prisma.providerRoutingSetting.create).not.toHaveBeenCalled();
    expect(f.prisma.model.create).not.toHaveBeenCalled();
    expect(f.prisma.model.update).not.toHaveBeenCalled();
  });
  it('preserves disabled offers on subsequent association syncs', async () => {
    const f = fixture();
    f.prisma.model.findFirst.mockImplementation(async ({ where }) => ({
      id: where.key,
      key: where.key,
      isProviderVariant: true,
    }));
    f.prisma.modelProviderOffer.findUnique.mockResolvedValue({
      isActive: false,
      priority: 4,
    });
    await expect(seedProviderOfferAssociations(f.client)).resolves.toBe(0);
    expect(f.prisma.modelProviderOffer.create).not.toHaveBeenCalled();
    expect(f.prisma.model.update).not.toHaveBeenCalled();
  });
});
