import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { persistQuoteGroupDisposition } from '@api/helpers/utils/credits/persist-quote-group-completion.util';
import {
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const quote = quoteModelBillablePricing(
    billableProfile(),
    { modelKey: 'test/model', provider: 'replicate', outputs: 2, requests: 2 },
    1,
    '2026-09-30T00:00:00.000Z',
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  const receipt = {
    kind: 'quote-group',
    reservationId: 'hold-1',
    outputIndex: 0,
  };
  const hold = {
    id: 'hold-1',
    status: CreditReservationStatus.RESERVED,
    metadata: {
      modelQuote: quote.snapshot,
      boundOutputIds: ['image-0', 'image-1'],
      dispatchClosed: false,
      pricingAudit: 'preserved',
    },
  };
  const tx = {
    ingredient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue(hold),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({ generationBilling: receipt }),
    },
    $transaction: vi.fn(async (run) => run(tx)),
  };
  return { prisma, tx, hold, receipt };
}
const where = {
  id: 'image-0',
  organizationId: 'org-1',
  isDeleted: false,
  status: IngredientStatus.PROCESSING,
};
const data = { status: IngredientStatus.GENERATED, s3Key: 'durable/image.png' };

describe('persistQuoteGroupDisposition', () => {
  it('writes the durable artifact and sticky financial evidence in the same scoped serializable transaction', async () => {
    const state = fixture();
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).resolves.toEqual({ count: 1 });
    expect(state.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: {
        AND: [where],
        organizationId: 'org-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
        generationBilling: { equals: state.receipt },
      },
      data,
    });
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'hold-1',
        organizationId: 'org-1',
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
      },
      data: {
        metadata: expect.objectContaining({
          pricingAudit: 'preserved',
          completedArtifacts: [
            {
              ingredientId: 'image-0',
              s3Key: 'durable/image.png',
              completedAt: expect.any(String),
            },
          ],
        }),
      },
    });
  });
  it('does not interpret a library FAILED update as provider-negative evidence', async () => {
    const state = fixture();
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, {
        status: IngredientStatus.FAILED,
      }),
    ).resolves.toBeNull();
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('atomically saves a confirmed provider-negative disposition with the FAILED CAS', async () => {
    const state = fixture();
    const failure = { status: IngredientStatus.FAILED };
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, failure, true),
    ).resolves.toEqual({ count: 1 });
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: {
        AND: [where],
        organizationId: 'org-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
        generationBilling: { equals: state.receipt },
      },
      data: failure,
    });
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            failedOutputIds: ['image-0'],
            completedArtifacts: [],
          }),
        },
      }),
    );
  });
  it('leaves legacy completion on its existing path', async () => {
    const state = fixture();
    state.prisma.ingredient.findFirst.mockResolvedValue({
      generationBilling: null,
    });
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).resolves.toBeNull();
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('does not manufacture evidence when the terminal transition loses its CAS', async () => {
    const state = fixture();
    state.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).resolves.toEqual({ count: 0 });
    expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
  });
  it('propagates evidence persistence failure so the transaction rolls back the GENERATED write', async () => {
    const state = fixture();
    state.tx.creditReservation.updateMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).rejects.toThrow('database unavailable');
  });
  it('rejects completion whose immutable hold disappeared instead of creating an unfunded success', async () => {
    const state = fixture();
    state.tx.creditReservation.findFirst.mockResolvedValue(null);
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        detail: 'Completed generation quote hold is unavailable',
      }),
    });
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
});
