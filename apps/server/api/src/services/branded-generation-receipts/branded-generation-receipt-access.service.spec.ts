import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
function database(role = 'member', brands: Array<{ id: string }> = []) {
  const mock = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    member: {
      findFirst: vi.fn().mockResolvedValue({ role: { key: role }, brands }),
    },
  };
  return { mock, tx: mock as unknown as Prisma.TransactionClient };
}
describe('current branded receipt access', () => {
  it.each(['owner', 'admin'])(
    'accepts current %s without assignment',
    async (role) => {
      const { tx, mock } = database(role, [{ id: 'other' }]);
      expect(
        await new BrandedGenerationReceiptAccessService().assertBrand(
          actor,
          tx,
        ),
      ).toEqual({ isOwnerOrAdmin: true });
      expect(mock.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org',
            userId: 'user',
            isDeleted: false,
            isActive: true,
          },
        }),
      );
    },
  );
  it('permits an unassigned member but enforces explicit brand assignments', async () => {
    const access = new BrandedGenerationReceiptAccessService();
    expect(await access.assertBrand(actor, database().tx)).toEqual({
      isOwnerOrAdmin: false,
    });
    await expect(
      access.assertBrand(actor, database('member', [{ id: 'foreign' }]).tx),
    ).rejects.toThrow('receipt_access_denied');
    expect(
      await access.assertBrand(actor, database('member', [{ id: 'brand' }]).tx),
    ).toEqual({ isOwnerOrAdmin: false });
  });
  it.each(['organization', 'brand', 'member'] as const)(
    'denies missing active %s without foreign details',
    async (field) => {
      const { mock, tx } = database();
      mock[field].findFirst.mockResolvedValue(null);
      await expect(
        new BrandedGenerationReceiptAccessService().assertBrand(actor, tx),
      ).rejects.toThrow('receipt_access_denied');
    },
  );
});
