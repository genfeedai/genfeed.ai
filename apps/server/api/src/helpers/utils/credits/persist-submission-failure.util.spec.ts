import {
  persistSubmissionFailure,
  persistSubmissionRejection,
} from '@api/helpers/utils/credits/persist-submission-failure.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const where = {
  id: 'avatar-1',
  organizationId: 'org-1',
  isDeleted: false,
  status: IngredientStatus.PROCESSING,
};
const failed = { status: IngredientStatus.FAILED };
function fixture(byok = false) {
  const hold = {
    id: 'hold-1',
    status: CreditReservationStatus.RESERVED,
    metadata: {
      assetId: 'avatar-1',
      submissionIntent: { version: 1, provider: 'heygen' },
      audit: 'preserved',
    },
  };
  const receipt = {
    kind: 'byok',
    amount: 0,
    description: 'Avatar',
    source: ActivitySource.VIDEO_GENERATION,
    state: 'pending',
    userId: 'user-1',
    expiresAt: '2026-09-30T00:00:00.000Z',
    submissionIntentProvider: 'heygen',
    audit: 'preserved',
  };
  const tx = {
    crunGenerationTask: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    ingredient: {
      findFirst: vi.fn().mockResolvedValue(
        byok
          ? {
              generationBilling: receipt,
              status: IngredientStatus.PROCESSING,
            }
          : null,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue(byok ? null : hold),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (operation) => operation(tx)),
  };
  return { tx, prisma: prisma as unknown as PrismaService, hold, receipt };
}

describe('confirmed submitted-generation failure evidence', () => {
  it('does not treat a generic FAILED projection as provider proof', async () => {
    const state = fixture();
    expect(
      await persistSubmissionFailure(state.prisma, where, failed, false),
    ).toBeNull();
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it('commits provider failure proof in the same transaction as the scoped FAILED CAS', async () => {
    const state = fixture();
    expect(
      await persistSubmissionFailure(state.prisma, where, failed, true),
    ).toEqual({ count: 1 });
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { ...where, AND: [where] },
      data: failed,
    });
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'hold-1',
        organizationId: 'org-1',
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
        metadata: { equals: state.hold.metadata },
      },
      data: {
        metadata: expect.objectContaining({
          audit: 'preserved',
          confirmedFailure: {
            version: 1,
            ingredientId: 'avatar-1',
            provider: 'heygen',
            kind: 'provider-terminal',
            observedAt: expect.any(String),
          },
        }),
      },
    });
  });
  it('propagates evidence failure so the enclosing transaction rolls back the FAILED write', async () => {
    const state = fixture();
    state.tx.creditReservation.updateMany.mockRejectedValue(
      new Error('Financial write failed'),
    );
    await expect(
      persistSubmissionFailure(state.prisma, where, failed, true),
    ).rejects.toThrow('Financial write failed');
  });
  it('does not write negative proof if the library CAS loses', async () => {
    const state = fixture();
    state.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await persistSubmissionFailure(state.prisma, where, failed, true),
    ).toEqual({ count: 0 });
    expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
  });
  it('records authenticated provider failure after a generic FAILED projection won', async () => {
    const state = fixture();
    const alreadyFailed = { ...where, status: IngredientStatus.FAILED };
    await persistSubmissionFailure(state.prisma, alreadyFailed, failed, true);
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { ...alreadyFailed, AND: [alreadyFailed] },
      data: failed,
    });
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            confirmedFailure: expect.objectContaining({
              kind: 'provider-terminal',
            }),
          }),
        },
      }),
    );
  });
  it('persists rejection before any library projection', async () => {
    const state = fixture();
    await persistSubmissionRejection(state.prisma, 'avatar-1', 'org-1');
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
    expect(state.tx.creditReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            confirmedFailure: expect.objectContaining({
              kind: 'submission-rejected',
            }),
          }),
        },
      }),
    );
  });
  it.each([IngredientStatus.PROCESSING, IngredientStatus.FAILED])(
    'atomically ends a BYOK receipt after authenticated failure from %s',
    async (status) => {
      const state = fixture(true);
      const transitionWhere = { ...where, status };
      expect(
        await persistSubmissionFailure(
          state.prisma,
          transitionWhere,
          failed,
          true,
        ),
      ).toEqual({ count: 1 });
      expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith({
        where: {
          ...transitionWhere,
          AND: [transitionWhere],
          generationBilling: { equals: state.receipt },
        },
        data: {
          status: IngredientStatus.FAILED,
          generationBilling: expect.objectContaining({
            state: 'failed',
            audit: 'preserved',
            confirmedFailure: expect.objectContaining({
              ingredientId: 'avatar-1',
              provider: 'heygen',
              kind: 'provider-terminal',
            }),
          }),
        },
      });
      expect(state.tx.creditReservation.updateMany).not.toHaveBeenCalled();
    },
  );
  it('durably ends a BYOK receipt before the rejection projection', async () => {
    const state = fixture(true);
    await persistSubmissionRejection(state.prisma, 'avatar-1', 'org-1');
    expect(state.tx.ingredient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'avatar-1',
          organizationId: 'org-1',
          isDeleted: false,
          generationBilling: { equals: state.receipt },
        }),
        data: {
          generationBilling: expect.objectContaining({
            state: 'failed',
            confirmedFailure: expect.objectContaining({
              kind: 'submission-rejected',
            }),
          }),
        },
      }),
    );
  });
  it('never rewrites a completed BYOK receipt as rejection', async () => {
    const state = fixture(true);
    state.tx.ingredient.findFirst.mockResolvedValue({
      generationBilling: { ...state.receipt, state: 'recorded' },
      status: IngredientStatus.GENERATED,
    });
    await expect(
      persistSubmissionRejection(state.prisma, 'avatar-1', 'org-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        detail: 'Submission rejection conflicts with completed BYOK usage',
      }),
    });
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it('denies a forged Crun failure even when the caller disables confirmation', async () => {
    const state = fixture(true);
    state.receipt.submissionIntentProvider = 'crun';
    state.tx.crunGenerationTask.findFirst.mockResolvedValue({
      state: 'submitting',
      providerTaskId: null,
    } as never);
    expect(
      await persistSubmissionFailure(state.prisma, where, failed, false),
    ).toEqual({ count: 0 });
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it('denies a missing durable task for a Crun BYOK receipt', async () => {
    const state = fixture(true);
    state.receipt.submissionIntentProvider = 'crun';
    expect(
      await persistSubmissionFailure(state.prisma, where, failed, true),
    ).toEqual({ count: 0 });
    expect(state.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
});
