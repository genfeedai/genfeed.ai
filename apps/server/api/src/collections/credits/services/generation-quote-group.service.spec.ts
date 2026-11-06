import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import type { RetryCreditBackService } from '@api/collections/credits/services/retry-credit-back.service';
import type { GenerationCreditReservationRequest } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import type { GenerationNativeCompletionEvidence } from '@api/helpers/utils/credits/generation-quote-group.schema';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientCategory,
} from '@genfeedai/contracts';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface LedgerClaim {
  amount?: number;
  kind: 'release' | 'settle';
  metadata?: Row;
}

const NATIVE_RATES: Partial<ModelBillablePricingProfile> = {
  provider: 'fal',
  rateVersion: 'native-v1',
  reviewedPricing: {
    currency: 'USD',
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
    reviewStatus: 'approved',
    sourceUrl:
      'https://fal.ai/models/bytedance/seedance-2.5/reference-to-video',
    verifiedAt: '2026-09-30T00:00:00.000Z',
    version: 'native-v1',
  },
};

const NATIVE_QUANTITIES: Partial<ModelBillableQuoteRequest> = {
  duration: 5,
  framesPerSecond: 24,
  height: 720,
  inputDuration: 4,
  referenceEvidenceHash: 'a'.repeat(64),
  width: 1280,
};

/** Key-order-independent JSON, as Postgres compares jsonb. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Row)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function price(
  profile: Partial<ModelBillablePricingProfile>,
  quantities: Partial<ModelBillableQuoteRequest>,
) {
  const quoted = quoteModelBillablePricing(
    billableProfile({ cost: 3.1, ...profile }),
    {
      modelKey: 'test/model',
      outputs: 3,
      provider: profile.provider ?? 'replicate',
      requests: 1,
      ...quantities,
    },
    1,
    '2026-09-30T00:00:00.000Z',
  );
  if (quoted.status !== 'priced') throw new Error(quoted.reason);
  return quoted.snapshot;
}

/**
 * One three-output generation group: its hold, its bound outputs, the
 * wallet that claims the hold and the credit-back grants after settlement.
 */
function world(
  profile: Partial<ModelBillablePricingProfile> = {},
  requests = 1,
  quantities: Partial<ModelBillableQuoteRequest> = {},
) {
  const quote = price(profile, { requests, ...quantities });
  const hold = {
    actorUserId: 'user-1',
    amount: quote.credits,
    expiresAt: new Date('2027-01-01'),
    id: 'hold-1',
    metadata: {
      boundOutputIds: ['image-0', 'image-1', 'image-2'],
      completedArtifacts: [] as {
        completedAt: string;
        ingredientId: string;
        s3Key: string;
      }[],
      dispatchClosed: true,
      failedOutputIds: ['image-0', 'image-1', 'image-2'],
      modelQuote: quote,
      providerCompletionConflicts: [] as string[],
      providerCompletions: [] as GenerationNativeCompletionEvidence[],
    },
    organizationId: 'org-1',
    source: ActivitySource.IMAGE_GENERATION,
    status: CreditReservationStatus.RESERVED,
  };
  const outputs = [0, 1, 2].map((outputIndex) => ({
    category: IngredientCategory.VIDEO,
    generationBilling: {
      kind: 'quote-group',
      outputIndex,
      reservationId: hold.id,
    } as Row | null,
    id: `image-${outputIndex}`,
    metadata: { externalId: `result-${outputIndex}`, externalProvider: 'fal' },
    organizationId: 'org-1',
  }));
  const tasks: Row[] = [];
  const ledger: LedgerClaim[] = [];
  const creditBacks: Row[] = [];
  const holdWrites: Row[] = [];
  const transactions: Row[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const races: { claim?: () => void; holdWrite?: () => void } = {};

  const ownsHold = (where: Row) =>
    where.id === hold.id && where.organizationId === hold.organizationId;
  const output = (where: Row) =>
    outputs.find(
      (row) =>
        row.id === where.id &&
        row.organizationId === where.organizationId &&
        (where.category === undefined || row.category === where.category),
    );
  // A wallet claim compares the hold evidence it was computed from.
  const claim = (expected: unknown) => {
    const race = races.claim;
    races.claim = undefined;
    race?.();
    if (
      hold.status !== CreditReservationStatus.RESERVED ||
      canonical(expected) !== canonical(hold.metadata)
    ) {
      throw new ReservationEvidenceChangedException();
    }
  };

  const prisma = {
    $transaction: async (
      run: (tx: unknown) => Promise<unknown>,
      options: Row,
    ) => {
      transactions.push(options);
      return run(prisma);
    },
    creditReservation: {
      findFirst: async ({ where }: { where: Row }) =>
        ownsHold(where) ? structuredClone(hold) : null,
      findMany: async () =>
        hold.status === CreditReservationStatus.RESERVED
          ? [structuredClone(hold)]
          : [],
      updateMany: async ({
        data,
        where,
      }: {
        data: { metadata: typeof hold.metadata };
        where: Row & { metadata?: { equals: unknown } };
      }) => {
        const race = races.holdWrite;
        races.holdWrite = undefined;
        race?.();
        if (
          !ownsHold(where) ||
          hold.status !== CreditReservationStatus.RESERVED ||
          (where.metadata &&
            canonical(where.metadata.equals) !== canonical(hold.metadata))
        ) {
          return { count: 0 };
        }
        hold.metadata = data.metadata;
        holdWrites.push(data.metadata);
        return { count: 1 };
      },
    },
    crunGenerationTask: {
      findFirst: async ({ where }: { where: Row }) =>
        tasks.find((task) => task.ingredientId === where.ingredientId) ?? null,
      findMany: async () => tasks,
    },
    ingredient: {
      findFirst: async ({ where }: { where: Row }) => {
        const found = output(where);
        return found ? structuredClone(found) : null;
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: { generationBilling: Row };
        where: Row;
      }) => {
        const found = output(where);
        if (!found || found.generationBilling !== null) return { count: 0 };
        found.generationBilling = data.generationBilling;
        return { count: 1 };
      },
    },
  };

  const service = new GenerationQuoteGroupService(
    {
      releaseReservation: async ({
        expectedReservationMetadata,
      }: {
        expectedReservationMetadata: unknown;
      }) => {
        claim(expectedReservationMetadata);
        hold.status = CreditReservationStatus.RELEASED;
        ledger.push({ kind: 'release' });
      },
      settleReservation: async ({
        actualAmount,
        expectedReservationMetadata,
        metadata,
      }: {
        actualAmount: number;
        expectedReservationMetadata: unknown;
        metadata: Row;
      }) => {
        claim(expectedReservationMetadata);
        hold.status = CreditReservationStatus.SETTLED;
        ledger.push({ amount: actualAmount, kind: 'settle', metadata });
      },
    } as unknown as CreditsUtilsService,
    prisma as unknown as PrismaService,
    {
      error: (message: string) => {
        errors.push(message);
      },
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService,
    {
      grantBestEffort: async (grant: Row) => {
        creditBacks.push(grant);
      },
    } as unknown as RetryCreditBackService,
  );

  /** Durable completion evidence for the output at `index`. */
  const recordComplete = (index: number) => {
    const id = `image-${index}`;
    hold.metadata.failedOutputIds = hold.metadata.failedOutputIds.filter(
      (failed) => failed !== id,
    );
    hold.metadata.completedArtifacts.push({
      completedAt: '2026-09-30T00:01:00.000Z',
      ingredientId: id,
      s3Key: 'durable/image.png',
    });
  };

  /** A group still admitting outputs, none bound yet. */
  const openGroup = () => {
    hold.metadata.boundOutputIds = [];
    hold.metadata.dispatchClosed = false;
    hold.metadata.failedOutputIds = [];
    for (const row of outputs) row.generationBilling = null;
  };

  return {
    creditBacks,
    errors,
    hold,
    holdWrites,
    ledger,
    openGroup,
    outputs,
    prisma,
    races,
    recordComplete,
    service,
    tasks,
    transactions,
    warnings,
  };
}

type World = ReturnType<typeof world>;

const nativeWorld = () => world(NATIVE_RATES, 1, NATIVE_QUANTITIES);

/** What fal reported for one output: its id and the seconds it rendered. */
const recordNative = (state: World, index = 0, duration = 3) =>
  state.service.recordProviderCompletion({
    externalId: `result-${index}`,
    ingredientId: `image-${index}`,
    modelKey: state.hold.metadata.modelQuote.modelKey,
    organizationId: 'org-1',
    provider: 'fal',
    quantities: { duration, height: 720, width: 1280 },
  });

/** fal reports each output, then each lands durably. */
async function completeNative(state: World, durations: number[]) {
  for (const [index, duration] of durations.entries()) {
    await recordNative(state, index, duration);
    state.recordComplete(index);
  }
}

const nativeCredits = (outputs: number) =>
  price(NATIVE_RATES, {
    ...NATIVE_QUANTITIES,
    duration: 3,
    outputs,
    provider: 'fal',
  }).credits;

const request = (
  fields: Partial<GenerationCreditReservationRequest> = {},
): GenerationCreditReservationRequest => ({
  creditsConfig: { description: 'test', reservationId: 'hold-1' },
  user: {
    organizationId: 'org-1',
  } as GenerationCreditReservationRequest['user'],
  ...fields,
});

describe('GenerationQuoteGroupService', () => {
  describe('native provider completion', () => {
    it('settles once from the actual adapter quantities, keeping only hashed provider ids', async () => {
      const state = nativeWorld();
      await completeNative(state, [3, 3, 3]);

      await state.service.settleGroup('hold-1', 'org-1');
      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        expect.objectContaining({ amount: nativeCredits(3), kind: 'settle' }),
      ]);
      expect(nativeCredits(3)).toBeLessThan(state.hold.amount);
      expect(state.hold.metadata.providerCompletions[0]).toEqual(
        expect.objectContaining({
          duration: 3,
          externalIdHash: quoteSnapshotHash('result-0'),
          quoteHash: quoteSnapshotHash(state.hold.metadata.modelQuote),
        }),
      );
      expect(
        JSON.stringify(state.hold.metadata.providerCompletions),
      ).not.toContain('result-0');
    });

    it('settles a partial result with the admitted input usage and no per-slot allocation', async () => {
      const state = nativeWorld();
      await completeNative(state, [3]);

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        expect.objectContaining({ amount: nativeCredits(1), kind: 'settle' }),
      ]);
    });

    it('records a retried receipt once and keeps the original proof after contradictory quantities', async () => {
      const state = nativeWorld();
      await recordNative(state);
      const original = structuredClone(state.hold.metadata.providerCompletions);

      await recordNative(state);
      await recordNative(state, 0, 4);
      state.recordComplete(0);
      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.holdWrites).toHaveLength(2);
      expect(state.hold.metadata.providerCompletions).toEqual(original);
      expect(state.hold.metadata.providerCompletionConflicts).toEqual([
        'image-0',
      ]);
      expect(state.ledger).toEqual([]);
      expect(state.warnings).toEqual([
        'Native completion proof is unresolved; retain funding',
      ]);
    });

    it.each([
      [
        'its proof no longer matches the frozen quote',
        async (state: World) => {
          await completeNative(state, [3]);
          state.hold.metadata.providerCompletions[0].quoteHash = 'b'.repeat(64);
        },
        'Native aggregate completion differs from its frozen contract; retain funding',
      ],
      [
        'the outputs rendered different durations',
        (state: World) => completeNative(state, [3, 4, 4]),
        'Native aggregate completion differs from its frozen contract; retain funding',
      ],
      [
        'an output completed without a provider proof',
        async (state: World) => {
          state.recordComplete(0);
        },
        'Native completion proof is unresolved; retain funding',
      ],
      [
        'the rendered quantity is above the approved credit ceiling',
        (state: World) => completeNative(state, [100]),
        'Generation completion quantity is unresolved; retain funding',
      ],
    ])('retains the hold when %s', async (_case, arrange, warning) => {
      const state = nativeWorld();
      await arrange(state);

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([]);
      expect(state.hold.status).toBe(CreditReservationStatus.RESERVED);
      expect(state.warnings).toEqual([warning]);
    });

    it('does not settle provider success until the durable artifact exists', async () => {
      const state = nativeWorld();
      state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];
      await recordNative(state);

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([]);
    });

    it.each([
      [
        'the provider id',
        (state: World) => {
          state.outputs[0].metadata.externalId = 'other';
        },
        { duration: 3, height: 720, width: 1280 },
      ],
      [
        'the provider',
        (state: World) => {
          state.outputs[0].metadata.externalProvider = 'replicate';
        },
        { duration: 3, height: 720, width: 1280 },
      ],
      [
        'the model',
        (state: World) => {
          state.hold.metadata.modelQuote.modelKey = 'other/model';
        },
        { duration: 3, height: 720, width: 1280 },
      ],
      [
        'the output position',
        (state: World) => {
          state.outputs[0].generationBilling = {
            kind: 'quote-group',
            outputIndex: 1,
            reservationId: 'hold-1',
          };
        },
        { duration: 3, height: 720, width: 1280 },
      ],
      ['a missing width', () => undefined, { duration: 3, height: 720 }],
      [
        'a non-finite duration',
        () => undefined,
        { duration: Number.NaN, height: 720, width: 1280 },
      ],
    ])(
      'saves no proof when %s differs from the bound output',
      async (_case, arrange, quantities) => {
        const state = nativeWorld();
        arrange(state);

        await expect(
          state.service.recordProviderCompletion({
            externalId: 'result-0',
            ingredientId: 'image-0',
            modelKey: 'test/model',
            organizationId: 'org-1',
            provider: 'fal',
            quantities,
          }),
        ).rejects.toThrow();

        expect(state.hold.metadata.providerCompletions).toEqual([]);
        expect(state.ledger).toEqual([]);
      },
    );

    it('refuses to save a proof when the hold evidence changed under it', async () => {
      const state = nativeWorld();
      state.races.holdWrite = () => {
        state.hold.metadata.providerCompletionConflicts = ['image-2'];
      };

      await expect(recordNative(state)).rejects.toBeInstanceOf(
        ReservationEvidenceChangedException,
      );
      expect(state.hold.metadata.providerCompletions).toEqual([]);
      expect(state.ledger).toEqual([]);
    });

    it('records no native proof for an output-priced group', async () => {
      const state = world();

      await recordNative(state);

      expect(state.holdWrites).toEqual([]);
      expect(state.hold.metadata.providerCompletions).toEqual([]);
    });

    it('closes an empty dispatch and releases its unused hold once', async () => {
      const state = nativeWorld();
      state.openGroup();

      await state.service.settleGroup('hold-1', 'org-1');
      expect(state.ledger).toEqual([]);

      await state.service.closeDispatch('hold-1', 'org-1');
      await state.service.closeDispatch('hold-1', 'org-1');

      expect(state.hold.metadata.dispatchClosed).toBe(true);
      expect(state.ledger).toEqual([{ kind: 'release' }]);
      expect(state.hold.status).toBe(CreditReservationStatus.RELEASED);
    });
  });

  describe('output-priced settlement', () => {
    it.each([0, 1, 2])(
      'charges one durable output the same at position %s, regardless of the [4,3,3] allocation',
      async (index) => {
        const state = world();
        state.recordComplete(index);

        await state.service.settleGroup('hold-1', 'org-1');

        expect(state.hold.metadata.modelQuote.allocatedCredits).toEqual([
          4, 3, 3,
        ]);
        expect(state.ledger).toEqual([
          expect.objectContaining({ amount: 4, kind: 'settle' }),
        ]);
      },
    );

    it('settles the rounded aggregate once and offers each output a retry credit-back', async () => {
      const state = world();
      state.recordComplete(0);
      state.recordComplete(1);
      state.recordComplete(2);

      await state.service.settleGroup('hold-1', 'org-1');
      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        expect.objectContaining({ amount: 10, kind: 'settle' }),
      ]);
      expect(state.creditBacks).toEqual([
        {
          chargedCredits: expect.closeTo(3.333, 2),
          ingredientId: 'image-0',
          organizationId: 'org-1',
        },
        {
          chargedCredits: expect.closeTo(3.333, 2),
          ingredientId: 'image-1',
          organizationId: 'org-1',
        },
        {
          chargedCredits: expect.closeTo(3.333, 2),
          ingredientId: 'image-2',
          organizationId: 'org-1',
        },
      ]);
    });

    it('settles against the frozen quote, never a later model row', async () => {
      const state = world();
      const frozen = structuredClone(state.hold.metadata.modelQuote);
      state.recordComplete(2);

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        {
          amount: 4,
          kind: 'settle',
          metadata: expect.objectContaining({
            completedOutputs: 1,
            modelQuote: frozen,
          }),
        },
      ]);
    });

    it('releases the hold when every output failed', async () => {
      const state = world();

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([{ kind: 'release' }]);
      expect(state.creditBacks).toEqual([]);
    });

    it.each([
      ['no output completed', () => undefined],
      [
        'one output completed',
        (state: World) => {
          state.recordComplete(0);
        },
      ],
    ])(
      'retains a per-request fee whose disposition is unresolved when %s',
      async (_case, arrange) => {
        const state = world({ pricingType: 'per-request' });
        arrange(state);

        await state.service.settleGroup('hold-1', 'org-1');

        expect(state.ledger).toEqual([]);
        expect(state.warnings).toEqual([
          'Generation request fee disposition is unresolved; retain funding',
        ]);
      },
    );

    it.each([
      [
        'an output has no terminal evidence yet',
        (state: World) => {
          state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];
        },
      ],
      [
        'dispatch admission is still open',
        (state: World) => {
          state.hold.metadata.dispatchClosed = false;
        },
      ],
      [
        'only the library marks the outputs failed',
        (state: World) => {
          state.hold.metadata.failedOutputIds = [];
        },
      ],
    ])('retains the hold while %s', async (_case, arrange) => {
      const state = world();
      arrange(state);

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([]);
      expect(state.hold.status).toBe(CreditReservationStatus.RESERVED);
    });

    it('charges immutable completion evidence after the library artifact is deleted', async () => {
      const state = world();
      state.hold.metadata.completedArtifacts = [
        {
          completedAt: '2026-09-30T00:01:00.000Z',
          ingredientId: 'image-0',
          s3Key: 'durable/image.png',
        },
      ];
      state.outputs.shift();

      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        expect.objectContaining({ amount: 4, kind: 'settle' }),
      ]);
    });

    it('refuses terminal evidence for an output outside the funded manifest', async () => {
      const state = world();
      state.hold.metadata.failedOutputIds = [
        ...state.hold.metadata.failedOutputIds,
        'image-9',
      ];

      await expect(
        state.service.settleGroup('hold-1', 'org-1'),
      ).rejects.toThrow('Terminal evidence exceeds its funded manifest');
      expect(state.ledger).toEqual([]);
    });

    it("leaves another organization's hold alone", async () => {
      const state = world();
      state.recordComplete(0);

      await state.service.settleGroup('hold-1', 'org-2');

      expect(state.ledger).toEqual([]);
    });

    it.each([
      [
        'a release',
        () => undefined,
        (state: World) => state.recordComplete(0),
        4,
      ],
      [
        'a partial settlement',
        (state: World) => state.recordComplete(0),
        (state: World) => state.recordComplete(1),
        7,
      ],
    ])(
      'recomputes when completion evidence lands before %s claims the hold',
      async (_case, arrange, race, amount) => {
        const state = world();
        arrange(state);
        state.races.claim = () => race(state);

        await state.service.settleGroup('hold-1', 'org-1');

        expect(state.ledger).toEqual([
          expect.objectContaining({ amount, kind: 'settle' }),
        ]);
        expect(state.hold.status).toBe(CreditReservationStatus.SETTLED);
      },
    );
  });

  describe('output binding', () => {
    it('binds the output and records it on the hold in one serializable transaction', async () => {
      const state = world();
      state.openGroup();

      await state.service.bindOutput(request(), 'image-0');

      expect(state.transactions).toEqual([{ isolationLevel: 'Serializable' }]);
      expect(state.outputs[0]?.generationBilling).toEqual({
        kind: 'quote-group',
        outputIndex: 0,
        reservationId: 'hold-1',
      });
      expect(state.hold.metadata.boundOutputIds).toEqual(['image-0']);
      expect(state.ledger).toEqual([]);
    });

    it("enlists in the caller's transaction without opening another", async () => {
      const state = world();
      state.openGroup();

      await state.service.bindOutputInTransaction(
        state.prisma as unknown as Prisma.TransactionClient,
        request(),
        'image-1',
      );

      expect(state.transactions).toEqual([]);
      expect(state.hold.metadata.boundOutputIds).toEqual(['image-1']);
      expect(state.outputs[1]?.generationBilling).toMatchObject({
        outputIndex: 0,
      });
    });

    it('treats a replayed bind of the same output as already done', async () => {
      const state = world();
      state.openGroup();

      await state.service.bindOutput(request(), 'image-0');
      await state.service.bindOutput(request(), 'image-0');

      expect(state.hold.metadata.boundOutputIds).toEqual(['image-0']);
      expect(state.holdWrites).toHaveLength(1);
    });

    it.each([
      [
        'Generation quote group identity is missing',
        () => undefined,
        request({ creditsConfig: undefined }),
      ],
      [
        'Generation quote hold has ended',
        (state: World) => {
          state.hold.status = CreditReservationStatus.RELEASED;
        },
        request(),
      ],
      [
        'Generation quote admission has expired',
        (state: World) => {
          state.hold.expiresAt = new Date(0);
        },
        request(),
      ],
      [
        'Generation dispatch is closed',
        (state: World) => {
          state.hold.metadata.dispatchClosed = true;
        },
        request(),
      ],
      [
        'Generation output exceeds its frozen authorization',
        (state: World) => {
          state.hold.metadata.boundOutputIds = ['image-1', 'image-2', 'x'];
        },
        request(),
      ],
      [
        'Generation output already has another billing owner',
        (state: World) => {
          state.outputs[0].generationBilling = { kind: 'byok' };
        },
        request(),
      ],
    ])('refuses to bind: %s', async (detail, arrange, input) => {
      const state = world();
      state.openGroup();
      arrange(state);
      const before = structuredClone(state.outputs[0]?.generationBilling);

      await expect(
        state.service.bindOutput(input, 'image-0'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ detail }),
      });

      expect(state.outputs[0]?.generationBilling).toEqual(before);
      expect(state.hold.metadata.boundOutputIds).not.toContain('image-0');
    });
  });

  describe('reconciliation', () => {
    it('closes an expired admission but keeps unresolved submissions funded until they land', async () => {
      const state = world();
      state.hold.metadata.dispatchClosed = false;
      state.hold.metadata.failedOutputIds = ['image-1', 'image-2'];

      await expect(
        state.service.reconcile(new Date('2027-01-02')),
      ).resolves.toBe(1);
      expect(state.hold.metadata.dispatchClosed).toBe(true);
      expect(state.ledger).toEqual([]);

      state.recordComplete(0);
      await state.service.settleGroup('hold-1', 'org-1');

      expect(state.ledger).toEqual([
        expect.objectContaining({ amount: 4, kind: 'settle' }),
      ]);
    });

    it('logs a hold it cannot settle and keeps sweeping', async () => {
      const state = world();
      state.hold.metadata.failedOutputIds = ['image-9'];

      await expect(
        state.service.reconcile(new Date('2026-12-01')),
      ).resolves.toBe(0);

      expect(state.errors).toEqual([
        'Generation quote group reconciliation failed',
      ]);
      expect(state.ledger).toEqual([]);
    });

    it.each([
      [
        'settles the group of an output with a quote-group receipt',
        () => undefined,
        true,
        [expect.objectContaining({ amount: 4, kind: 'settle' })],
      ],
      [
        'reports an output without a quote-group receipt as not owned',
        (state: World) => {
          state.outputs[0].generationBilling = null;
        },
        false,
        [],
      ],
      [
        'leaves an output whose provider receipt conflicts to recovery',
        (state: World) => {
          state.tasks.push({
            ingredientId: 'image-0',
            recoveryCode: 'CRUN_TERMINAL_RECEIPT_CONFLICT',
          });
        },
        true,
        [],
      ],
    ])('reconcileOutput %s', async (_case, arrange, handled, ledger) => {
      const state = world();
      state.recordComplete(0);
      arrange(state);

      await expect(
        state.service.reconcileOutput('image-0', 'org-1'),
      ).resolves.toBe(handled);
      expect(state.ledger).toEqual(ledger);
    });
  });
});
