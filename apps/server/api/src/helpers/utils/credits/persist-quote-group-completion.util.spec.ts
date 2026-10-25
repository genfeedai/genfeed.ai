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
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        generationBilling: receipt,
        status: IngredientStatus.PROCESSING,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue(hold),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        generationBilling: receipt,
        status: IngredientStatus.PROCESSING,
      }),
    },
    $transaction: vi.fn(async (run) => run(tx)),
  };
  tx.ingredient.findFirst = prisma.ingredient.findFirst;
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
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
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
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('preserves provider evidence when the durable artifact is saved atomically', async () => {
    const state = fixture();
    Object.assign(state.hold.metadata, {
      providerCompletions: [
        {
          ingredientId: 'image-0',
          outputIndex: 0,
          provider: 'fal',
          externalIdHash: 'a'.repeat(64),
          modelKey: 'test/model',
          quoteHash: 'b'.repeat(64),
          width: 1280,
          height: 720,
          duration: 3,
        },
      ],
      providerCompletionConflicts: ['image-1'],
    });
    await persistQuoteGroupDisposition(state.prisma as never, where, data);
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            providerCompletions: [
              expect.objectContaining({
                duration: 3,
                externalIdHash: 'a'.repeat(64),
              }),
            ],
            providerCompletionConflicts: ['image-1'],
            completedArtifacts: [
              expect.objectContaining({
                ingredientId: 'image-0',
                s3Key: 'durable/image.png',
              }),
            ],
          }),
        },
      }),
    );
  });
  it('does not manufacture evidence when the terminal transition loses its CAS', async () => {
    const state = fixture();
    state.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).resolves.toEqual({ count: 0 });
    expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    [IngredientStatus.GENERATED, CreditReservationStatus.SETTLED],
    [IngredientStatus.FAILED, CreditReservationStatus.RELEASED],
  ])(
    'returns a lost claim for a %s output even when its hold is %s',
    async (status, holdStatus) => {
      const state = fixture();
      state.tx.ingredient.findFirst.mockResolvedValue({
        generationBilling: state.receipt,
        status,
      });
      state.tx.creditReservation.findFirst.mockResolvedValue({
        ...state.hold,
        status: holdStatus,
      });

      await expect(
        persistQuoteGroupDisposition(
          state.prisma as never,
          where,
          { status: IngredientStatus.FAILED },
          true,
        ),
      ).resolves.toEqual({ count: 0 });

      expect(state.tx.ingredient.findFirst).toHaveBeenCalledWith({
        where: { id: 'image-0', organizationId: 'org-1', isDeleted: false },
        select: { generationBilling: true, status: true },
      });
      expect(state.tx.creditReservation.findFirst).not.toHaveBeenCalled();
      expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
      expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    CreditReservationStatus.SETTLED,
    CreditReservationStatus.RELEASED,
    null,
  ])(
    'keeps the funding error for a processing output with a %s hold',
    async (holdStatus) => {
      const state = fixture();
      state.tx.creditReservation.findFirst.mockResolvedValue(
        holdStatus === null ? null : { ...state.hold, status: holdStatus },
      );

      await expect(
        persistQuoteGroupDisposition(
          state.prisma as never,
          where,
          { status: IngredientStatus.FAILED },
          true,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Completed generation quote hold is unavailable',
        }),
      });
      expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
      expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
    },
  );

  it('reloads terminal ownership after a serializable cancellation conflict', async () => {
    const state = fixture();
    state.tx.ingredient.findFirst
      .mockResolvedValueOnce({
        generationBilling: state.receipt,
        status: IngredientStatus.PROCESSING,
      })
      .mockResolvedValue({
        generationBilling: state.receipt,
        status: IngredientStatus.GENERATED,
      });
    state.tx.ingredient.updateMany.mockRejectedValueOnce({ code: 'P2034' });
    state.tx.creditReservation.findFirst
      .mockResolvedValueOnce(state.hold)
      .mockResolvedValue({
        ...state.hold,
        status: CreditReservationStatus.SETTLED,
      });

    await expect(
      persistQuoteGroupDisposition(
        state.prisma as never,
        where,
        { status: IngredientStatus.FAILED },
        true,
      ),
    ).resolves.toEqual({ count: 0 });
    expect(state.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledOnce();
    expect(state.tx.creditReservation.findFirst).toHaveBeenCalledOnce();
    expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the legacy fallback for an already-terminal output without a quote receipt', async () => {
    const state = fixture();
    state.tx.ingredient.findFirst.mockResolvedValue({
      generationBilling: null,
      status: IngredientStatus.GENERATED,
    });

    await expect(
      persistQuoteGroupDisposition(state.prisma as never, where, data),
    ).resolves.toBeNull();
    expect(state.tx.creditReservation.findFirst).not.toHaveBeenCalled();
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
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
