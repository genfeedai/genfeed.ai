import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const systemActor = {
  actorId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
  brandId: 'genfeed-system-brand',
  organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
};

function database(brand: { id: string } | null) {
  const mock = {
    brand: { findFirst: vi.fn().mockResolvedValue(brand) },
    member: { findFirst: vi.fn().mockResolvedValue(null) },
    organization: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { mock, tx: mock as unknown as Prisma.TransactionClient };
}

describe('system principal receipt access', () => {
  const access = new BrandedGenerationReceiptAccessService(
    brandAccessFixture(),
  );

  it('grants owner-level access to a live system organization brand without a member', async () => {
    const { mock, tx } = database({ id: systemActor.brandId });
    await expect(access.assertBrand(systemActor, tx)).resolves.toEqual({
      isOwnerOrAdmin: true,
    });
    expect(mock.brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: systemActor.brandId,
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
    expect(mock.member.findFirst).not.toHaveBeenCalled();
  });

  it('denies a brand that is missing or deleted', async () => {
    await expect(
      access.assertBrand(systemActor, database(null).tx),
    ).rejects.toThrow('receipt_access_denied');
  });

  it('does not extend to a customer organization', async () => {
    const { mock, tx } = database({ id: 'brand-1' });
    await expect(
      access.assertBrand(
        { ...systemActor, brandId: 'brand-1', organizationId: 'org-1' },
        tx,
      ),
    ).rejects.toThrow('receipt_access_denied');
    expect(mock.member.findFirst).toHaveBeenCalled();
  });
});
