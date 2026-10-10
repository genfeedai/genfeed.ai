import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import type { GenerationNativeCompletionEvidence } from '@api/helpers/utils/credits/generation-quote-group.schema';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function fixture(
  profile: Partial<ModelBillablePricingProfile> = {},
  requests = 1,
  quantities: Partial<ModelBillableQuoteRequest> = {},
) {
  const quoted = quoteModelBillablePricing(
    billableProfile({ cost: 3.1, ...profile }),
    {
      modelKey: 'test/model',
      provider: profile.provider ?? 'replicate',
      outputs: 3,
      requests,
      ...quantities,
    },
    1,
    '2026-09-30T00:00:00.000Z',
  );
  if (quoted.status !== 'priced') throw new Error(quoted.reason);
  const hold = {
    id: 'hold-1',
    organizationId: 'org-1',
    amount: quoted.snapshot.credits,
    actorUserId: 'user-1',
    status: CreditReservationStatus.RESERVED,
    source: ActivitySource.IMAGE_GENERATION,
    expiresAt: new Date('2027-01-01'),
    metadata: {
      modelQuote: quoted.snapshot,
      boundOutputIds: ['image-0', 'image-1', 'image-2'],
      dispatchClosed: true,
      failedOutputIds: ['image-0', 'image-1', 'image-2'],
      providerCompletions: [] as GenerationNativeCompletionEvidence[],
      providerCompletionConflicts: [] as string[],
      completedArtifacts: [] as {
        ingredientId: string;
        s3Key: string;
        completedAt: string;
      }[],
    },
  };
  const outputs = Array.from({ length: 3 }, (_, outputIndex) => ({
    id: `image-${outputIndex}`,
    status: IngredientStatus.FAILED,
    s3Key: null as string | null,
    metadata: { externalId: `result-${outputIndex}`, externalProvider: 'fal' },
    generationBilling: {
      kind: 'quote-group',
      reservationId: hold.id,
      outputIndex,
    },
  }));
  const credits = {
    releaseReservation: vi.fn(async () => {
      hold.status = CreditReservationStatus.RELEASED;
    }),
    settleReservation: vi.fn(async () => {
      hold.status = CreditReservationStatus.SETTLED;
    }),
  };
  const prisma = {
    crunGenerationTask: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    creditReservation: {
      findFirst: vi.fn(async () => structuredClone(hold)),
      findMany: vi.fn(async () => [hold]),
      updateMany: vi.fn(async (input) => {
        hold.metadata = input.data.metadata;
        return { count: 1 };
      }),
    },
    ingredient: {
      findMany: vi.fn(async (input) =>
        outputs.filter((output) => input.where.id.in.includes(output.id)),
      ),
      findFirst: vi.fn(async () => outputs[0]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (run) => run(prisma)),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new GenerationQuoteGroupService(
    credits as never,
    prisma as never,
    logger as never,
  );
  const recordComplete = (index: number) => {
    const id = `image-${index}`;
    hold.metadata.failedOutputIds = hold.metadata.failedOutputIds.filter(
      (failed) => failed !== id,
    );
    hold.metadata.completedArtifacts.push({
      ingredientId: id,
      s3Key: 'durable/image.png',
      completedAt: '2026-09-30T00:01:00.000Z',
    });
  };
  return { credits, hold, logger, outputs, prisma, service, recordComplete };
}

function nativeFixture() {
  return fixture(
    {
      provider: 'fal',
      rateVersion: 'native-v1',
      reviewedPricing: {
        currency: 'USD',
        version: 'native-v1',
        reviewStatus: 'approved',
        sourceUrl:
          'https://fal.ai/models/bytedance/seedance-2.5/reference-to-video',
        verifiedAt: '2026-09-30T00:00:00.000Z',
        rates: [
          {
            component: 'output',
            unit: 'video-token',
            unitPriceUsd: 0.0000214,
            when: {},
          },
          {
            component: 'input',
            unit: 'input-video-token',
            unitPriceUsd: 0.00001284,
            when: {},
          },
        ],
      },
    },
    1,
    {
      width: 1280,
      height: 720,
      duration: 5,
      inputDuration: 4,
      framesPerSecond: 24,
      referenceEvidenceHash: 'a'.repeat(64),
    },
  );
}

describe('GenerationQuoteGroupService', () => {
  const recordNative = (
    state: ReturnType<typeof nativeFixture>,
    index = 0,
    duration = 3,
  ) =>
    state.service.recordProviderCompletion({
      ingredientId: `image-${index}`,
      organizationId: 'org-1',
      externalId: `result-${index}`,
      provider: 'fal',
      modelKey: state.hold.metadata.modelQuote.modelKey,
      quantities: { width: 1280, height: 720, duration },
    });

  it('settles native completion from actual adapter quantities and frozen source evidence once', async () => {
    const state = nativeFixture();
    for (let index = 0; index < 3; index++) {
      state.prisma.ingredient.findFirst.mockResolvedValue(state.outputs[index]);
      await recordNative(state, index);
      state.recordComplete(index);
    }
    const expected = quoteModelBillablePricing(
      state.hold.metadata.modelQuote.pricingProfile,
      {
        ...state.hold.metadata.modelQuote.quantities,
        duration: 3,
        modelKey: 'test/model',
        provider: 'fal',
      },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (expected.status !== 'priced') throw new Error(expected.reason);

    await state.service.settleGroup('hold-1', 'org-1');
    await state.service.settleGroup('hold-1', 'org-1');

    expect(state.credits.settleReservation).toHaveBeenCalledTimes(1);
    expect(state.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: expected.snapshot.credits }),
    );
    expect(expected.snapshot.credits).toBeLessThan(state.hold.amount);
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    expect(state.hold.metadata.providerCompletions[0]).toEqual(
      expect.objectContaining({
        externalIdHash: quoteSnapshotHash('result-0'),
        quoteHash: quoteSnapshotHash(state.hold.metadata.modelQuote),
        duration: 3,
      }),
    );
    expect(
      JSON.stringify(state.hold.metadata.providerCompletions),
    ).not.toContain('result-0');
  });

  it('records retry receipts idempotently and retains original proof after contradictory provider quantities', async () => {
    const state = nativeFixture();
    await recordNative(state);
    const original = structuredClone(state.hold.metadata.providerCompletions);
    await recordNative(state);
    expect(state.prisma.creditReservation.updateMany).toHaveBeenCalledTimes(1);
    await recordNative(state, 0, 4);
    expect(state.hold.metadata.providerCompletions).toEqual(original);
    expect(state.hold.metadata.providerCompletionConflicts).toEqual([
      'image-0',
    ]);
    state.recordComplete(0);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('settles a partial native result with the admitted input usage and no per-slot allocation', async () => {
    const state = nativeFixture();
    await recordNative(state);
    state.recordComplete(0);
    const expected = quoteModelBillablePricing(
      state.hold.metadata.modelQuote.pricingProfile,
      {
        ...state.hold.metadata.modelQuote.quantities,
        outputs: 1,
        requests: 1,
        duration: 3,
        modelKey: 'test/model',
        provider: 'fal',
      },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (expected.status !== 'priced') throw new Error(expected.reason);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: expected.snapshot.credits }),
    );
    expect(state.prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'image-0',
        organizationId: 'org-1',
        isDeleted: false,
        category: IngredientCategory.VIDEO,
      },
      select: {
        generationBilling: true,
        metadata: { select: { externalId: true, externalProvider: true } },
      },
    });
    expect(state.prisma.creditReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          metadata: { equals: expect.any(Object) },
        }),
      }),
    );
  });

  it('retains a completed native result if its persisted proof no longer matches the frozen quote', async () => {
    const state = nativeFixture();
    await recordNative(state);
    state.recordComplete(0);
    state.hold.metadata.providerCompletions[0].quoteHash = 'b'.repeat(64);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it.each([
    'external-id',
    'provider',
    'model',
    'output-index',
    'missing-width',
    'non-finite-duration',
  ])(
    'does not save trusted native proof after %s identity or quantity mismatch',
    async (mismatch) => {
      const state = nativeFixture();
      if (mismatch === 'external-id')
        state.outputs[0].metadata.externalId = 'other';
      if (mismatch === 'provider')
        state.outputs[0].metadata.externalProvider = 'replicate';
      if (mismatch === 'model')
        state.hold.metadata.modelQuote.modelKey = 'other/model';
      if (mismatch === 'output-index')
        state.outputs[0].generationBilling.outputIndex = 1;
      const input = {
        ingredientId: 'image-0',
        organizationId: 'org-1',
        externalId: 'result-0',
        provider: 'fal' as const,
        modelKey: 'test/model',
        quantities: {
          width: mismatch === 'missing-width' ? undefined : 1280,
          height: 720,
          duration: mismatch === 'non-finite-duration' ? Number.NaN : 3,
        },
      };
      await expect(
        state.service.recordProviderCompletion(input),
      ).rejects.toThrow();
      expect(state.prisma.creditReservation.updateMany).not.toHaveBeenCalled();
      expect(state.credits.settleReservation).not.toHaveBeenCalled();
      expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    },
  );

  it('retains native funding above its approved credit ceiling without clamping', async () => {
    const state = nativeFixture();
    await recordNative(state, 0, 100);
    state.recordComplete(0);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('does not settle provider success until the separate durable artifact exists', async () => {
    const state = nativeFixture();
    state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];
    await recordNative(state);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('retains heterogeneous native quantities rather than inventing a per-artifact price aggregation', async () => {
    const state = nativeFixture();
    for (let index = 0; index < 3; index++) {
      state.prisma.ingredient.findFirst.mockResolvedValue(state.outputs[index]);
      await recordNative(state, index, index === 0 ? 3 : 4);
      state.recordComplete(index);
    }
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('refuses a lost proof-write CAS without claiming financial completion', async () => {
    const state = nativeFixture();
    state.prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordNative(state)).rejects.toBeInstanceOf(
      ReservationEvidenceChangedException,
    );
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
  });

  it('preserves legacy non-native admission without inventing a native proof', async () => {
    const state = fixture();
    await state.service.recordProviderCompletion({
      ingredientId: 'image-0',
      organizationId: 'org-1',
      externalId: 'result-0',
      provider: 'fal',
      modelKey: 'test/model',
      quantities: { width: 1280, height: 720, duration: 3 },
    });
    expect(state.prisma.creditReservation.updateMany).not.toHaveBeenCalled();
  });

  it('closes empty native dispatch and releases its unused hold only once', async () => {
    const state = nativeFixture();
    state.hold.metadata.boundOutputIds = [];
    state.hold.metadata.failedOutputIds = [];
    state.hold.metadata.dispatchClosed = false;
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();

    await state.service.closeDispatch('hold-1', 'org-1');
    await state.service.closeDispatch('hold-1', 'org-1');

    expect(state.hold.metadata.dispatchClosed).toBe(true);
    expect(state.prisma.crunGenerationTask.findMany).toHaveBeenCalledWith({
      where: {
        reservationId: 'hold-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
    });
    expect(state.credits.releaseReservation).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org-1',
      reservationId: 'hold-1',
      expectedReservationMetadata: state.hold.metadata,
    });
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
  });

  it('retains bound native funding when actual completion quantities are missing', async () => {
    const state = nativeFixture();
    state.recordComplete(0);

    await state.service.settleGroup('hold-1', 'org-1');

    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalledWith(
      'Native completion proof is unresolved; retain funding',
      expect.objectContaining({ reservationId: 'hold-1' }),
    );
  });

  it.each([0, 1, 2])(
    'prices one durable output identically at position %s, independently of [4,3,3]',
    async (index) => {
      const state = fixture();
      state.outputs[index].status = IngredientStatus.GENERATED;
      state.outputs[index].s3Key = 'durable/image.png';
      state.recordComplete(index);
      await state.service.settleGroup('hold-1', 'org-1');
      expect(state.hold.metadata.modelQuote.allocatedCredits).toEqual([
        4, 3, 3,
      ]);
      expect(state.credits.settleReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          actualAmount: 4,
          reservationId: 'hold-1',
          organizationId: 'org-1',
        }),
      );
      expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    },
  );

  it('settles the aggregate rounded amount once after duplicate completion/finalizer calls', async () => {
    const state = fixture();
    for (const output of state.outputs) {
      output.status = IngredientStatus.GENERATED;
      output.s3Key = 'durable';
      state.recordComplete(state.outputs.indexOf(output));
    }
    await state.service.settleGroup('hold-1', 'org-1');
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).toHaveBeenCalledTimes(1);
    expect(state.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 10 }),
    );
  });

  it('releases an output-priced group when no artifact completed', async () => {
    const state = fixture();
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.releaseReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        organizationId: 'org-1',
        reservationId: 'hold-1',
        expectedReservationMetadata: state.hold.metadata,
      }),
    );
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    'retains unresolved request-component funding with %s completed outputs',
    async (count) => {
      const state = fixture({ pricingType: 'per-request' });
      if (count) {
        state.outputs[0].status = IngredientStatus.GENERATED;
        state.outputs[0].s3Key = 'durable';
        state.recordComplete(0);
      }
      await state.service.settleGroup('hold-1', 'org-1');
      expect(state.credits.settleReservation).not.toHaveBeenCalled();
      expect(state.credits.releaseReservation).not.toHaveBeenCalled();
      expect(state.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('fee disposition'),
        expect.anything(),
      );
    },
  );

  it('does not settle while provider work or dispatch admission is still open', async () => {
    const state = fixture();
    state.outputs[0].status = IngredientStatus.PROCESSING;
    state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];
    await state.service.settleGroup('hold-1', 'org-1');
    state.outputs[0].status = IngredientStatus.FAILED;
    state.hold.metadata.dispatchClosed = false;
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('requires durable stored output evidence and retains missing output funding', async () => {
    const state = fixture();
    state.outputs[0].status = IngredientStatus.GENERATED;
    state.hold.metadata.failedOutputIds = ['image-1'];
    await state.service.settleGroup('hold-1', 'org-1');
    state.outputs[0].s3Key = 'durable';
    state.outputs.pop();
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('binds immutable tenant-owned output intent transactionally before dispatch', async () => {
    const state = fixture();
    state.hold.metadata.boundOutputIds = [];
    state.hold.metadata.dispatchClosed = false;
    await state.service.bindOutput(
      {
        creditsConfig: { reservationId: 'hold-1', description: 'test' },
        user: { organizationId: 'org-1' } as never,
      },
      'image-0',
    );
    expect(state.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(state.prisma.ingredient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'image-0',
          organizationId: 'org-1',
          isDeleted: false,
          generationBilling: { equals: Prisma.DbNull },
        },
      }),
    );
    expect(state.hold.metadata.boundOutputIds).toEqual(['image-0']);
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
  });

  it('enlists placeholder and group binding in the caller transaction without opening another transaction', async () => {
    const state = fixture();
    state.hold.metadata.boundOutputIds = [];
    state.hold.metadata.dispatchClosed = false;
    const tx = state.prisma as unknown as Prisma.TransactionClient;
    await state.service.bindOutputInTransaction(
      tx,
      {
        creditsConfig: { reservationId: 'hold-1', description: 'test' },
        user: { organizationId: 'org-1' } as never,
      },
      'image-0',
    );
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
    expect(state.prisma.ingredient.updateMany).toHaveBeenCalledTimes(1);
    expect(state.hold.metadata.boundOutputIds).toEqual(['image-0']);
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it('refuses new or replayed dispatch admission after the group is closed', async () => {
    const state = fixture();
    await expect(
      state.service.bindOutput(
        {
          creditsConfig: { reservationId: 'hold-1', description: 'test' },
          user: { organizationId: 'org-1' } as never,
        },
        'image-0',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        detail: 'Generation dispatch is closed',
      }),
    });
    expect(state.prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'deleted'])(
    'charges immutable completion evidence after a library artifact is %s',
    async (disposition) => {
      const state = fixture();
      state.hold.metadata.completedArtifacts = [
        {
          ingredientId: 'image-0',
          s3Key: 'durable/image.png',
          completedAt: '2026-09-30T00:01:00.000Z',
        },
      ];
      if (disposition === 'deleted') state.outputs.shift();
      else state.outputs[0].status = IngredientStatus.REJECTED;
      await state.service.settleGroup('hold-1', 'org-1');
      expect(state.credits.settleReservation).toHaveBeenCalledWith(
        expect.objectContaining({ actualAmount: 4 }),
      );
      expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    },
  );

  it('expires admission while retaining funding for an unresolved submission intent', async () => {
    const state = fixture();
    state.hold.metadata.dispatchClosed = false;
    state.outputs[0].status = IngredientStatus.PROCESSING;
    state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];
    await state.service.reconcile(new Date('2027-01-02'));
    expect(state.hold.metadata.dispatchClosed).toBe(true);
    expect(state.outputs[0].status).toBe(IngredientStatus.PROCESSING);
    expect(state.prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    state.outputs[0].status = IngredientStatus.GENERATED;
    state.outputs[0].s3Key = 'late/durable';
    state.recordComplete(0);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 4 }),
    );
  });

  it('does not admit a provider submission after its frozen hold expires', async () => {
    const state = fixture();
    state.hold.expiresAt = new Date(0);
    state.hold.metadata.dispatchClosed = false;
    await expect(
      state.service.bindOutput(
        {
          creditsConfig: { reservationId: 'hold-1', description: 'test' },
          user: { organizationId: 'org-1' } as never,
        },
        'image-0',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        detail: 'Generation quote admission has expired',
      }),
    });
    expect(state.prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it.each(['release', 'partial-settlement'])(
    'recomputes after immutable completion evidence changes before a %s ledger claim',
    async (claim) => {
      const state = fixture();
      if (claim === 'partial-settlement') state.recordComplete(0);
      const changed = async () => {
        state.recordComplete(claim === 'release' ? 0 : 1);
        throw new ReservationEvidenceChangedException();
      };
      if (claim === 'release')
        state.credits.releaseReservation.mockImplementationOnce(changed);
      else state.credits.settleReservation.mockImplementationOnce(changed);
      await state.service.settleGroup('hold-1', 'org-1');
      expect(state.credits.settleReservation).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actualAmount: claim === 'release' ? 4 : 7,
          expectedReservationMetadata: state.hold.metadata,
        }),
      );
      expect(state.hold.status).toBe(CreditReservationStatus.SETTLED);
    },
  );

  it('never interprets a user-authored FAILED library status as confirmed provider failure', async () => {
    const state = fixture();
    state.hold.metadata.failedOutputIds = [];
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
  });

  it('never prices using a later model row or margin setting', async () => {
    const state = fixture();
    state.outputs[2].status = IngredientStatus.GENERATED;
    state.outputs[2].s3Key = 'durable';
    state.recordComplete(2);
    await state.service.settleGroup('hold-1', 'org-1');
    expect(state.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 4,
        metadata: expect.objectContaining({
          modelQuote: state.hold.metadata.modelQuote,
        }),
      }),
    );
    expect(state.prisma.creditReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
        }),
      }),
    );
  });
});
