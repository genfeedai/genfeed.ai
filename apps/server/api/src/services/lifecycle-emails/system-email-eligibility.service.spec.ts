import type { ServerPrisma } from '@api/server.dependencies';
import { IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { SystemEmailEligibilityService } from './system-email-eligibility.service';

const input = {
  organizationId: 'org-1',
  userId: 'user-1',
  templateKey: 'welcome-day-2',
};
function fixture() {
  const prisma = {
    credential: { findFirst: vi.fn().mockResolvedValue(null) },
    article: { findFirst: vi.fn().mockResolvedValue(null) },
    post: { findFirst: vi.fn().mockResolvedValue(null) },
    ingredient: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    creditBalance: {
      findFirst: vi.fn().mockResolvedValue({ balance: 1200, heldAmount: 400 }),
    },
    lifecycleEmailDelivery: {
      findFirst: vi.fn().mockResolvedValue({ status: 'canceled' }),
    },
    creditTransaction: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return {
    prisma,
    service: new SystemEmailEligibilityService(
      prisma as unknown as ServerPrisma,
    ),
  };
}

describe('send-time system email eligibility', () => {
  it('suppresses a connection nudge if an account was connected after scheduling', async () => {
    const { prisma, service } = fixture();
    prisma.credential.findFirst.mockResolvedValue({ id: 'credential-1' });
    expect(await service.shouldSend(input)).toBe(false);
    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          isConnected: true,
        }),
      }),
    );
  });
  it('requires the same brand to have a connection for its reminder', async () => {
    const { prisma, service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'publishing-connection',
        policyData: { brandId: 'brand-1' },
      }),
    ).toBe(true);
    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: 'brand-1' }),
      }),
    );
  });
  it('subtracts held credits and cancels low-balance email after a top-up', async () => {
    const { prisma, service } = fixture();
    expect(
      await service.shouldSend({ ...input, templateKey: 'credit-low' }),
    ).toBe(true);
    prisma.creditBalance.findFirst.mockResolvedValue({
      balance: 5000,
      heldAmount: 400,
    });
    expect(
      await service.shouldSend({ ...input, templateKey: 'credit-low' }),
    ).toBe(false);
  });
  it('cancels checkout recovery when checkout completed while delivery was pending', async () => {
    const { service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'checkout-recovery',
        policyData: { lifecycleDeliveryId: 'delivery-1' },
      }),
    ).toBe(false);
  });
  it('rejects a stale generation email after a different completion replaces it', async () => {
    const { prisma, service } = fixture();
    prisma.ingredient.findFirst.mockResolvedValue({
      status: IngredientStatus.GENERATED,
      generationStartedAt: new Date('2026-09-09T12:00:00Z'),
      generationCompletedAt: new Date('2026-09-09T12:04:00Z'),
      s3Key: 'output.mp4',
    });
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'generation-ready',
        policyData: {
          assetId: 'asset-1',
          completedAt: '2026-09-09T12:03:00.000Z',
          status: IngredientStatus.GENERATED,
        },
      }),
    ).toBe(false);
  });
  it('refuses an unconfirmed purchase receipt', async () => {
    const { service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'credit-purchase-confirmation',
        policyData: { transactionId: 'txn-1' },
      }),
    ).toBe(false);
  });
});
