import type { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import type { RetryCreditBackService } from '@api/collections/credits/services/retry-credit-back.service';
import { currentWorkflowAccountingScope } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { FreeTrialEmailsService } from '@api/services/lifecycle-emails/free-trial-emails.service';
import { LowCreditThresholdService } from '@api/services/low-credit-threshold/low-credit-threshold.service';
import type { DefaultGenerationAffordabilityService } from '@api/services/router/default-generation-affordability.service';
import type { PrismaService as ApiPrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { WorkflowAccountingScope } from '@genfeedai/contracts/interfaces';
import type {
  IDeductCreditsOptions,
  IReleaseCreditReservationInput,
  ISettleCreditReservationInput,
} from '@genfeedai/contracts/interfaces/billing';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import type { RedisService } from '@libs/redis/redis.service';
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface AssetRow {
  category: IngredientCategory;
  generationBilling: Row | null;
  id: string;
  isDeleted: boolean;
  metadata: {
    externalId: string | null;
    id: string;
    isDeleted: boolean;
    result: string | null;
  } | null;
  organizationId: string;
  s3Key: string | null;
  status: string;
  userId: string;
}

interface Where {
  id?: string;
  idempotencyKey?: string;
  ingredientId?: string;
  isDeleted?: boolean;
  organizationId?: string;
}

interface MetadataWrite {
  data: { externalId: string };
  where: {
    id: string;
    ingredients: { some: { id: string; organizationId: string } };
    OR: Array<{ externalId: string | null }>;
  };
}

type Client = 'default' | 'proof-transaction';

function asset(overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    category: IngredientCategory.IMAGE,
    generationBilling: null,
    id: 'asset',
    isDeleted: false,
    metadata: { externalId: null, id: 'meta', isDeleted: false, result: null },
    organizationId: 'org-1',
    s3Key: 'owned/asset.png',
    status: 'GENERATED',
    userId: 'user-1',
    ...overrides,
  };
}

function world() {
  const state = {
    activities: [] as Row[],
    assets: [] as AssetRow[],
    balance: 5000,
    balanceReads: [] as Array<{ client: Client; organizationId: string }>,
    creditBacks: [] as Row[],
    crunTasks: [] as Row[],
    deductions: [] as Row[],
    executions: [] as Where[],
    faults: {
      balance: [] as Error[],
      deduct: [] as Error[],
      deductAfterCommit: [] as Error[],
      ledger: [] as Error[],
      settle: [] as Error[],
      transaction: [] as unknown[],
    },
    // Default image price per configured model: 8 credits for the
    // organization's own default.
    imagePrices: { 'org-image-model': 8 } as Record<string, number>,
    isRedisAvailable: true,
    journal: [] as string[],
    // A paying organization whose latest plan grant was 10,000 credits, so
    // its low-credit threshold is 1,000 (10%).
    latestPaidGrant: 10_000 as number | null,
    ledger: [] as Row[],
    locks: [] as string[],
    logs: [] as Array<{ level: string; message: string }>,
    races: { beforeMetadataWrite: undefined as (() => void) | undefined },
    reads: [] as string[],
    redis: new Map<string, { ttlSeconds: number; value: string }>(),
    releases: [] as IReleaseCreditReservationInput[],
    settlements: [] as Row[],
    transactionAttempts: [] as unknown[],
    trial: { isTrialExpired: false, trialEndsAt: null as Date | null },
    trialEmails: [] as string[],
  };

  const findAsset = (where: Where) => {
    state.reads.push(`ingredient:${where.id}`);
    const row = state.assets.find(
      (item) =>
        item.id === where.id &&
        item.organizationId === where.organizationId &&
        !item.isDeleted,
    );
    return row ? structuredClone(row) : null;
  };
  const findTask = (where: Where) => {
    state.reads.push(`crun-task:${where.ingredientId}`);
    const row = state.crunTasks.find(
      (item) =>
        item.ingredientId === where.ingredientId &&
        item.organizationId === where.organizationId &&
        item.isDeleted === false,
    );
    return row ? structuredClone(row) : null;
  };
  const proofClient = {
    $queryRaw: async (query: {
      strings: readonly string[];
      values: unknown[];
    }) => {
      const table = /FROM "(\w+)"/.exec(query.strings.join('?'))?.[1];
      state.locks.push(`${table}:${query.values.join(':')}`);
      return [];
    },
    creditTransaction: {
      findFirst: async ({ where }: { where: Where }) =>
        state.ledger.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.idempotencyKey === where.idempotencyKey,
        ) ?? null,
    },
    crunGenerationTask: {
      findFirst: async ({ where }: { where: Where }) => findTask(where),
    },
    ingredient: {
      findFirst: async ({ where }: { where: Where }) => findAsset(where),
    },
  };
  const clientOf = (tx: unknown): Client =>
    Object.is(tx, proofClient) ? 'proof-transaction' : 'default';

  const prisma = {
    ...proofClient,
    $transaction: async (
      operation: (client: typeof proofClient) => Promise<void>,
      options: unknown,
    ) => {
      state.transactionAttempts.push(options);
      const fault = state.faults.transaction.shift();
      if (fault) throw fault;
      return operation(proofClient);
    },
    metadata: {
      updateMany: async ({ data, where }: MetadataWrite) => {
        const race = state.races.beforeMetadataWrite;
        state.races.beforeMetadataWrite = undefined;
        race?.();
        const owner = state.assets.find(
          (item) =>
            item.metadata?.id === where.id &&
            !item.metadata.isDeleted &&
            item.id === where.ingredients.some.id &&
            item.organizationId === where.ingredients.some.organizationId &&
            !item.isDeleted,
        );
        const allowed = where.OR.map((clause) => clause.externalId);
        if (!owner?.metadata || !allowed.includes(owner.metadata.externalId)) {
          return { count: 0 };
        }
        owner.metadata.externalId = data.externalId;
        state.journal.push(`metadata ${where.id}=${data.externalId}`);
        return { count: 1 };
      },
    },
    organization: {
      findFirst: async () => ({ label: 'Acme Studio' }),
    },
    organizationSetting: {
      findFirst: async () => ({ defaultImageModel: 'org-image-model' }),
    },
    workflowExecution: {
      findFirst: async ({ where }: { where: Where }) =>
        state.executions.find(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            !row.isDeleted,
        ) ?? null,
    },
  };

  const creditsUtils = {
    deductCreditsFromOrganization: async (
      organizationId: string,
      userId: string,
      amount: number,
      description: string,
      source: ActivitySource,
      options?: IDeductCreditsOptions,
    ) => {
      const fault = state.faults.deduct.shift();
      if (fault) throw fault;
      const isRecorded = state.deductions.some(
        (row) =>
          row.idempotencyKey !== undefined &&
          row.idempotencyKey === options?.idempotencyKey,
      );
      if (!isRecorded) {
        state.deductions.push({
          amount,
          description,
          organizationId,
          scope: currentWorkflowAccountingScope(),
          source,
          userId,
          ...options,
        });
      }
      const lostReply = state.faults.deductAfterCommit.shift();
      if (lostReply) throw lostReply;
    },
    getOrganizationCreditsBalance: async (
      organizationId: string,
      tx?: unknown,
    ) => {
      const fault = state.faults.balance.shift();
      if (fault) throw fault;
      state.balanceReads.push({ client: clientOf(tx), organizationId });
      return state.balance;
    },
    releaseReservation: async (input: IReleaseCreditReservationInput) => {
      state.releases.push(input);
    },
    settleReservation: async (input: ISettleCreditReservationInput) => {
      const fault = state.faults.settle.shift();
      if (fault) throw fault;
      if (
        state.settlements.some(
          (row) => row.reservationId === input.reservationId,
        )
      ) {
        return;
      }
      state.journal.push(`settle ${input.reservationId}`);
      state.settlements.push({
        ...input,
        scope: currentWorkflowAccountingScope(),
      });
    },
  };

  const creditTransactions = {
    createTransactionEntry: async (
      ...args: Parameters<CreditTransactionsService['createTransactionEntry']>
    ) => {
      const [
        organizationId,
        category,
        amount,
        balanceBefore,
        balanceAfter,
        source,
        description,
        ,
        tx,
        options,
      ] = args;
      const fault = state.faults.ledger.shift();
      if (fault) throw fault;
      if (
        state.ledger.some(
          (row) => row.idempotencyKey === options?.idempotencyKey,
        )
      ) {
        throw Object.assign(new Error('duplicate ledger key'), {
          code: 'P2002',
        });
      }
      state.ledger.push({
        amount,
        balanceAfter,
        balanceBefore,
        category,
        client: clientOf(tx),
        description,
        organizationId,
        source,
        ...options,
      });
    },
    getLatestPaidGrantCredits: async () => state.latestPaidGrant,
  };

  const publisher = {
    set: async (key: string, value: string, _ex: 'EX', ttl: number) => {
      if (state.redis.has(key)) return null;
      state.redis.set(key, { ttlSeconds: ttl, value });
      return 'OK';
    },
  };
  const log = (level: string) => (message: unknown) => {
    state.logs.push({ level, message: String(message) });
  };

  const processor = new CreditDeductionProcessor(
    creditsUtils as unknown as CreditsUtilsService,
    creditTransactions as unknown as CreditTransactionsService,
    {
      record: async (input: Row) => {
        state.activities.push(input);
        return { id: 'activity-1' };
      },
    } as unknown as ActivityRecorderService,
    {
      getPublisher: () => (state.isRedisAvailable ? publisher : null),
    } as unknown as RedisService,
    {
      debug: log('debug'),
      error: log('error'),
      log: () => undefined,
      warn: log('warn'),
    } as unknown as LoggerService,
    prisma as unknown as PrismaService,
    // The real shared threshold owner over the in-memory inputs.
    new LowCreditThresholdService(
      prisma as unknown as ApiPrismaService,
      {
        getState: async () => state.trial,
      } as unknown as FreeTrialService,
      {
        getDefaultImageCredits: async (
          _organizationId: string,
          model: string,
        ) => state.imagePrices[model] ?? null,
      } as unknown as DefaultGenerationAffordabilityService,
      creditTransactions as unknown as CreditTransactionsService,
    ),
    {
      sendTrialCreditsLow: async (organizationId: string) => {
        state.trialEmails.push(organizationId);
        return true;
      },
    } as unknown as FreeTrialEmailsService,
    {
      grantBestEffort: async (input: Row) => {
        state.creditBacks.push(input);
      },
    } as unknown as RetryCreditBackService,
  );

  return Object.assign(state, { processor });
}

function buildJob(
  data: Partial<CreditDeductionJobData>,
): Job<CreditDeductionJobData> {
  return {
    attemptsMade: 0,
    data: {
      amount: 10,
      description: 'Image generation',
      organizationId: 'org-1',
      source: ActivitySource.IMAGE_GENERATION,
      type: 'deduct-credits',
      userId: 'user-1',
      ...data,
    },
    id: 'job-1',
    opts: { attempts: 3 },
  } as Job<CreditDeductionJobData>;
}

const SCOPE: WorkflowAccountingScope = {
  organizationId: 'org-1',
  workflowExecutionId: 'run',
  workflowNodeId: 'node',
  workflowOperationId: 'attempt',
};

const ACCEPTED = { externalId: 'provider-id', ingredientId: 'asset' };

describe('CreditDeductionProcessor', () => {
  describe('accepted provider identity', () => {
    it('persists the provider identity before settling, and a retry settles the same hold once', async () => {
      const w = world();
      w.assets.push(asset());
      w.faults.settle.push(new Error('database busy'));
      const job = buildJob({
        acceptedGeneration: ACCEPTED,
        reservationId: 'hold',
      });

      await expect(w.processor.process(job)).rejects.toThrow('database busy');
      await w.processor.process(job);

      expect(w.journal).toEqual([
        'metadata meta=provider-id',
        'metadata meta=provider-id',
        'settle hold',
      ]);
      expect(w.assets[0]?.metadata?.externalId).toBe('provider-id');
      expect(w.settlements).toEqual([
        expect.objectContaining({ actualAmount: 10, reservationId: 'hold' }),
      ]);
      expect(w.deductions).toEqual([]);
      expect(w.releases).toEqual([]);
    });

    it.each([
      ['a missing asset', []],
      [
        'an asset of another organization',
        [asset({ organizationId: 'org-2' })],
      ],
      ['a deleted asset', [asset({ isDeleted: true })]],
      [
        'deleted metadata',
        [
          asset({
            metadata: {
              externalId: null,
              id: 'meta',
              isDeleted: true,
              result: null,
            },
          }),
        ],
      ],
      [
        'a conflicting provider identity',
        [
          asset({
            metadata: {
              externalId: 'other-provider-id',
              id: 'meta',
              isDeleted: false,
              result: null,
            },
          }),
        ],
      ],
    ])('refuses %s permanently before charging', async (_name, assets) => {
      const w = world();
      w.assets.push(...assets);

      await expect(
        w.processor.process(
          buildJob({ acceptedGeneration: ACCEPTED, reservationId: 'hold' }),
        ),
      ).rejects.toBeInstanceOf(UnrecoverableError);

      expect(w.journal).toEqual([]);
      expect(w.settlements).toEqual([]);
      expect(w.releases).toEqual([]);
    });

    it('retries without charging when another provider claims the metadata mid-write', async () => {
      const w = world();
      w.assets.push(asset());
      w.races.beforeMetadataWrite = () => {
        w.assets.splice(
          0,
          1,
          asset({
            metadata: {
              externalId: 'other-provider-id',
              id: 'meta',
              isDeleted: false,
              result: null,
            },
          }),
        );
      };

      const rejection = w.processor.process(
        buildJob({ acceptedGeneration: ACCEPTED, reservationId: 'hold' }),
      );

      await expect(rejection).rejects.toThrow(
        'Accepted generation metadata changed before persistence',
      );
      await expect(rejection).rejects.not.toBeInstanceOf(UnrecoverableError);
      expect(w.assets[0]?.metadata?.externalId).toBe('other-provider-id');
      expect(w.settlements).toEqual([]);
    });

    it('records the identity of a zero-credit acceptance without charging', async () => {
      const w = world();
      w.assets.push(asset());

      await w.processor.process(
        buildJob({ acceptedGeneration: ACCEPTED, amount: 0 }),
      );

      expect(w.assets[0]?.metadata?.externalId).toBe('provider-id');
      expect(w.deductions).toEqual([]);
      expect(w.settlements).toEqual([]);
    });

    it('retries accepted BYOK tracking under one durable ledger key without a credit charge', async () => {
      const w = world();
      w.assets.push(asset());
      w.faults.ledger.push(new Error('ledger unavailable'));
      const job = buildJob({
        acceptedGeneration: ACCEPTED,
        idempotencyKey: 'interpolation-asset',
        type: 'record-byok-usage',
      });

      await expect(w.processor.process(job)).rejects.toThrow(
        'ledger unavailable',
      );
      await w.processor.process(job);

      expect(w.ledger).toEqual([
        {
          actorUserId: 'user-1',
          amount: 10,
          balanceAfter: 5000,
          balanceBefore: 5000,
          category: CreditTransactionCategory.BYOK_USAGE,
          client: 'default',
          description: '[BYOK] Image generation',
          idempotencyKey: 'byok:org-1:interpolation-asset',
          organizationId: 'org-1',
          source: ActivitySource.IMAGE_GENERATION,
        },
      ]);
      expect(w.assets[0]?.metadata?.externalId).toBe('provider-id');
      expect(w.settlements).toEqual([]);
      expect(w.deductions).toEqual([]);
    });
  });

  describe('workflow accounting scope', () => {
    it('charges inside the scope of a live workflow execution', async () => {
      const w = world();
      w.executions.push({
        id: 'run',
        isDeleted: false,
        organizationId: 'org-1',
      });

      await w.processor.process(
        buildJob({ idempotencyKey: 'charge-1', workflowAccounting: SCOPE }),
      );

      expect(w.deductions).toEqual([
        expect.objectContaining({ idempotencyKey: 'charge-1', scope: SCOPE }),
      ]);
    });

    it.each([
      ['deleted', [{ id: 'run', isDeleted: true, organizationId: 'org-1' }]],
      ['unavailable', []],
      [
        'owned by another organization',
        [{ id: 'run', isDeleted: false, organizationId: 'org-2' }],
      ],
    ])(
      'still charges a trusted job whose execution is %s, without its scope',
      async (_name, executions) => {
        const w = world();
        w.executions.push(...executions);

        await w.processor.process(
          buildJob({ idempotencyKey: 'charge-1', workflowAccounting: SCOPE }),
        );

        expect(w.deductions).toEqual([
          expect.objectContaining({
            idempotencyKey: 'charge-1',
            scope: undefined,
          }),
        ]);
      },
    );

    it('refuses a forged organization scope before charging', async () => {
      const w = world();
      w.executions.push({
        id: 'run',
        isDeleted: false,
        organizationId: 'foreign',
      });

      await expect(
        w.processor.process(
          buildJob({
            workflowAccounting: { ...SCOPE, organizationId: 'foreign' },
          }),
        ),
      ).rejects.toThrow('does not match');

      expect(w.deductions).toEqual([]);
    });
  });

  describe('charging', () => {
    it('settles a media-generation hold once through the reserved branch, forwarding its metadata and brand', async () => {
      const w = world();
      const job = buildJob({
        brandId: 'brand-1',
        idempotencyKey: 'media-generation-settle:hold-1',
        metadata: { assetId: 'asset-1', marginMultiplier: 3.33 },
        reservationId: 'hold-1',
      });

      await w.processor.process(job);
      await w.processor.process(job);

      expect(w.settlements).toEqual([
        {
          actorUserId: 'user-1',
          actualAmount: 10,
          brandId: 'brand-1',
          description: 'Image generation',
          metadata: { assetId: 'asset-1', marginMultiplier: 3.33 },
          organizationId: 'org-1',
          reservationId: 'hold-1',
          settlementIdempotencyKey: 'media-generation-settle:hold-1',
          source: ActivitySource.IMAGE_GENERATION,
        },
      ]);
      expect(w.deductions).toEqual([]);
      expect(w.reads).toEqual([]);
    });

    it('books a legacy late-settlement job against the reservation ledger reference', async () => {
      const w = world();

      await w.processor.process(
        buildJob({ idempotencyKey: 'media-generation-late-settle:hold-1' }),
      );

      expect(w.deductions).toEqual([
        expect.objectContaining({
          idempotencyKey: 'media-generation-late-settle:hold-1',
          referenceId: 'hold-1',
          referenceType: 'credit_reservation',
        }),
      ]);
    });

    it('books a completion charge with its own billing references and brand', async () => {
      const w = world();

      await w.processor.process(
        buildJob({
          amount: 18,
          brandId: 'brand-1',
          description: 'Fleet voice clone compute',
          idempotencyKey: 'fleet-voice-clone-job-1',
          maxOverdraftCredits: 25,
          metadata: { fleetJobId: 'job-1', processTimeSeconds: 61 },
          referenceId: 'job-1',
          referenceType: 'fleet:voice-clone',
          source: ActivitySource.VOICE_GENERATION,
        }),
      );

      expect(w.deductions).toEqual([
        {
          amount: 18,
          brandId: 'brand-1',
          description: 'Fleet voice clone compute',
          idempotencyKey: 'fleet-voice-clone-job-1',
          maxOverdraftCredits: 25,
          metadata: { fleetJobId: 'job-1', processTimeSeconds: 61 },
          organizationId: 'org-1',
          referenceId: 'job-1',
          referenceType: 'fleet:voice-clone',
          source: ActivitySource.VOICE_GENERATION,
          userId: 'user-1',
        },
      ]);
      expect(w.settlements).toEqual([]);
    });

    it('refuses a deduction job with no user permanently', async () => {
      const w = world();

      await expect(
        w.processor.process(buildJob({ userId: undefined })),
      ).rejects.toBeInstanceOf(UnrecoverableError);

      expect(w.deductions).toEqual([]);
    });

    it('charges once when a keyed job is retried after the ledger committed', async () => {
      const w = world();
      w.faults.deductAfterCommit.push(
        new Error('connection lost after commit'),
      );
      const job = buildJob({ idempotencyKey: 'credit-settle:hold-9' });

      await expect(w.processor.process(job)).rejects.toThrow('after commit');
      await w.processor.process(job);

      expect(w.deductions).toEqual([
        expect.objectContaining({
          amount: 10,
          idempotencyKey: 'credit-settle:hold-9',
        }),
      ]);
    });

    it('charges a keyless legacy job once per job id across redelivery', async () => {
      const w = world();
      w.faults.deductAfterCommit.push(
        new Error('connection lost after commit'),
      );
      const job = buildJob({});

      await expect(w.processor.process(job)).rejects.toThrow('after commit');
      await w.processor.process(job);
      await w.processor.process(job);

      expect(w.deductions).toEqual([
        expect.objectContaining({
          amount: 10,
          idempotencyKey: 'credit-job:job-1',
        }),
      ]);
    });

    it('turns a business-rule refusal into a permanent failure and logs it', async () => {
      const w = world();
      w.faults.deduct.push(new BusinessLogicException('insufficient credits'));

      await expect(w.processor.process(buildJob({}))).rejects.toBeInstanceOf(
        UnrecoverableError,
      );

      expect(w.logs).toEqual([
        { level: 'error', message: 'CreditDeductionProcessor job failed' },
      ]);
      expect(w.deductions).toEqual([]);
    });

    it('rethrows a transient failure unchanged so BullMQ retries', async () => {
      const w = world();
      w.faults.deduct.push(new Error('db timeout'));

      const rejection = w.processor.process(buildJob({}));

      await expect(rejection).rejects.toThrow('db timeout');
      await expect(rejection).rejects.not.toBeInstanceOf(UnrecoverableError);
    });
  });

  describe('legacy completion gate', () => {
    it.each(['FAILED', 'REJECTED', 'ARCHIVED', 'failed'])(
      'releases the hold of a %s legacy media job without charging',
      async (status) => {
        const w = world();
        w.assets.push(asset({ id: 'legacy-asset', status }));

        await w.processor.process(
          buildJob({
            reservationId: 'legacy-hold',
            settlementAssetId: 'legacy-asset',
          }),
        );

        expect(w.releases).toEqual([
          { organizationId: 'org-1', reservationId: 'legacy-hold' },
        ]);
        expect(w.settlements).toEqual([]);
      },
    );

    it('releases a generated legacy asset that holds no output', async () => {
      const w = world();
      w.assets.push(asset({ id: 'legacy-asset', s3Key: null }));

      await w.processor.process(
        buildJob({
          reservationId: 'legacy-hold',
          settlementAssetId: 'legacy-asset',
        }),
      );

      expect(w.releases).toEqual([
        { organizationId: 'org-1', reservationId: 'legacy-hold' },
      ]);
      expect(w.settlements).toEqual([]);
    });

    it.each([
      ['an owned file', 'VALIDATED', 'owned/legacy.png', null],
      ['a provider result', 'GENERATED', null, 'https://provider.test/out.png'],
    ])(
      'settles a terminal legacy asset with %s',
      async (_name, status, s3Key, result) => {
        const w = world();
        w.assets.push(
          asset({
            id: 'legacy-asset',
            metadata: {
              externalId: null,
              id: 'meta',
              isDeleted: false,
              result,
            },
            s3Key,
            status,
          }),
        );

        await w.processor.process(
          buildJob({
            reservationId: 'legacy-hold',
            settlementAssetId: 'legacy-asset',
          }),
        );

        expect(w.settlements).toEqual([
          expect.objectContaining({
            actualAmount: 10,
            reservationId: 'legacy-hold',
          }),
        ]);
        expect(w.releases).toEqual([]);
      },
    );

    it.each([
      ['PROCESSING', [asset({ id: 'legacy-asset', status: 'PROCESSING' })]],
      ['missing', []],
      ['missing', [asset({ id: 'legacy-asset', organizationId: 'org-2' })]],
    ])(
      'keeps a %s legacy asset for retry without charging',
      async (label, assets) => {
        const w = world();
        w.assets.push(...assets);

        await expect(
          w.processor.process(buildJob({ settlementAssetId: 'legacy-asset' })),
        ).rejects.toThrow(
          `Media asset legacy-asset is not terminal (${label})`,
        );

        expect(w.deductions).toEqual([]);
        expect(w.releases).toEqual([]);
      },
    );
  });

  describe('retry credit back', () => {
    it('credits back a settled media charge for its asset', async () => {
      const w = world();

      await w.processor.process(
        buildJob({ metadata: { assetId: 'asset-1' }, reservationId: 'hold-1' }),
      );

      expect(w.creditBacks).toEqual([
        {
          chargedCredits: 10,
          ingredientId: 'asset-1',
          organizationId: 'org-1',
        },
      ]);
    });

    it.each([
      ['a charge without an asset', { amount: 10, metadata: { mode: 'x' } }],
      ['a zero charge', { amount: 0, metadata: { assetId: 'asset-1' } }],
      [
        'a duration top-up',
        {
          amount: 4,
          metadata: {
            assetId: 'asset-1',
            durationTopUpOfReservationId: 'hold-0',
          },
        },
      ],
    ])('grants nothing for %s', async (_name, data) => {
      const w = world();

      await w.processor.process(buildJob({ ...data, reservationId: 'hold-1' }));

      expect(w.creditBacks).toEqual([]);
    });
  });

  describe('low-credits alert', () => {
    it('alerts the owner and operators once and arms a 24-hour debounce when the balance drops below the threshold', async () => {
      const w = world();
      w.balance = 500;

      await w.processor.process(buildJob({}));

      expect(w.activities).toEqual([
        {
          alert: {
            deduplicationKey: expect.stringMatching(
              /^credits-low\/org-1\/\d+$/,
            ),
            operatorMessages: {
              discord: {
                action: 'low_credits_alert',
                payload: {
                  balance: 500,
                  organizationId: 'org-1',
                  organizationLabel: 'Acme Studio',
                },
                type: 'discord',
              },
            },
          },
          key: ActivityKey.CREDITS_LOW,
          organizationId: 'org-1',
          source: ActivitySource.SCRIPT,
          value: JSON.stringify({ balance: 500, threshold: 1000 }),
        },
      ]);
      expect([...w.redis.entries()]).toEqual([
        ['low-credits-notified:org-1', { ttlSeconds: 86400, value: '1' }],
      ]);
    });

    it('stays quiet while the debounce key from an earlier alert is set', async () => {
      const w = world();
      w.balance = 500;
      w.redis.set('low-credits-notified:org-1', {
        ttlSeconds: 86400,
        value: '1',
      });

      await w.processor.process(buildJob({}));

      expect(w.activities).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'debug',
          message:
            'CreditDeductionProcessor low-credits alert already sent for org-1 (debounced)',
        },
      ]);
    });

    it('skips the alert and warns when redis is unavailable', async () => {
      const w = world();
      w.balance = 500;
      w.isRedisAvailable = false;

      await w.processor.process(buildJob({}));

      expect(w.activities).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message:
            'CreditDeductionProcessor Redis not available for low-credits debounce',
        },
      ]);
    });

    it('never fails the charge when the low-credits check fails', async () => {
      const w = world();
      w.faults.balance.push(new Error('balance lookup failed'));

      await expect(w.processor.process(buildJob({}))).resolves.toBeUndefined();

      expect(w.deductions).toHaveLength(1);
      expect(w.logs).toEqual([
        {
          level: 'error',
          message: 'CreditDeductionProcessor failed to check low credits',
        },
      ]);
    });

    describe('relative threshold', () => {
      const inTrial = {
        isTrialExpired: false,
        trialEndsAt: new Date('2026-10-13T00:00:00.000Z'),
      };

      it('does not flag a never-paid organization whose free credits still buy its default image', async () => {
        const w = world();
        w.trial = inTrial;
        // 25 free credits used to read as "low" against a fixed 1000.
        w.balance = 25;

        await w.processor.process(buildJob({}));

        expect(w.activities).toEqual([]);
        expect(w.trialEmails).toEqual([]);
      });

      it('alerts and emails a never-paid organization once its balance cannot buy its default image', async () => {
        const w = world();
        w.trial = inTrial;
        w.balance = 5;

        await w.processor.process(buildJob({}));

        expect(w.trialEmails).toEqual(['org-1']);
        expect(w.activities).toEqual([
          expect.objectContaining({
            key: ActivityKey.CREDITS_LOW,
            value: JSON.stringify({ balance: 5, threshold: 8 }),
          }),
        ]);
      });

      it('stays quiet for an expired trial (admission already refuses it)', async () => {
        const w = world();
        w.trial = {
          isTrialExpired: true,
          trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
        };
        w.balance = 5;

        await w.processor.process(buildJob({}));

        expect(w.activities).toEqual([]);
        expect(w.trialEmails).toEqual([]);
      });

      it.each([
        // 10% of a 500-credit pack is 50.
        [60, []],
        [
          40,
          [
            expect.objectContaining({
              value: JSON.stringify({ balance: 40, threshold: 50 }),
            }),
          ],
        ],
      ])(
        'scales a paying organization threshold with its latest paid grant (balance %i)',
        async (balance, activities) => {
          const w = world();
          w.latestPaidGrant = 500;
          w.balance = balance;

          await w.processor.process(buildJob({}));

          expect(w.activities).toEqual(activities);
          expect(w.trialEmails).toEqual([]);
        },
      );

      it('does not guess a threshold when neither a price nor a paid grant is known', async () => {
        const w = world();
        w.imagePrices = {};
        w.latestPaidGrant = null;
        w.balance = 0;

        await w.processor.process(buildJob({}));

        expect(w.activities).toEqual([]);
      });
    });
  });

  describe('BYOK usage', () => {
    it('records usage as a zero-balance-change ledger entry with canonical actor and output attribution', async () => {
      const w = world();
      w.balance = 1234;

      await w.processor.process(
        buildJob({
          amount: 3,
          brandId: 'brand-1',
          description: 'BYOK image call',
          metadata: { assetId: 'asset-1' },
          type: 'record-byok-usage',
          userId: 'canonical-user',
        }),
      );

      expect(w.ledger).toEqual([
        {
          actorUserId: 'canonical-user',
          amount: 3,
          balanceAfter: 1234,
          balanceBefore: 1234,
          brandId: 'brand-1',
          category: CreditTransactionCategory.BYOK_USAGE,
          client: 'default',
          description: '[BYOK] BYOK image call',
          idempotencyKey: 'byok:org-1:job-1',
          metadata: { assetId: 'asset-1' },
          organizationId: 'org-1',
          source: ActivitySource.IMAGE_GENERATION,
        },
      ]);
      expect(w.deductions).toEqual([]);
      expect(w.settlements).toEqual([]);
    });
  });
});

describe('Crun media BYOK consumer authority', () => {
  function crunWorld(
    amount = 3,
    endpoint = 'google/nano-banana-pro',
    category: IngredientCategory = IngredientCategory.IMAGE,
  ) {
    const w = world();
    w.balance = 100;
    const modelKey = `crun/${endpoint}`;
    const receipt = {
      amount,
      description: 'Image generation',
      expiresAt: '2099-01-01T00:00:00.000Z',
      kind: 'byok',
      source:
        category === IngredientCategory.VIDEO
          ? ActivitySource.VIDEO_GENERATION
          : ActivitySource.IMAGE_GENERATION,
      state: 'pending',
      submissionIntentProvider: 'crun',
      userId: 'user-1',
    };
    const { kind: _kind, state: _state, ...immutable } = receipt;
    const priced = quoteModelBillablePricing(
      billableProfile({
        cost: amount,
        isFree: amount === 0,
        key: modelKey,
        provider: 'crun',
      }),
      { modelKey, outputs: 1, provider: 'crun', requests: 1 },
      1,
      new Date().toISOString(),
    );
    if (priced.status !== 'priced') throw new Error('Invalid fixture quote');
    const quote = {
      ...priced.snapshot,
      providerQuote: {
        acquisitionRateVersion: null,
        contractVersion: 'v1',
        credentialFingerprint: 'c'.repeat(64),
        credentialId: null,
        credentialSource: 'byok',
        creditsPerUsd: null,
        estimated: false,
        inputHash: 'b'.repeat(64),
        provider: 'crun',
        providerCreditsPerTask: '8',
        quoteHash: 'a'.repeat(64),
      },
    };
    const task: Row = {
      contractVersion: 'v1',
      credentialFingerprint: 'c'.repeat(64),
      credentialId: null,
      credentialSource: 'byok',
      endpoint,
      fundingBinding: { kind: 'byok', receipt: immutable },
      ingredientId: 'image',
      inputHash: 'b'.repeat(64),
      isDeleted: false,
      leaseUntil: new Date(Date.now() + 60000),
      mediaPersistedAt: new Date(),
      modelKey: quote.modelKey,
      organizationId: 'org-1',
      outputIndex: 0,
      quoteSnapshot: quote,
      recoveryCode: null,
      reservationId: null,
      state: 'provider-success',
      terminalReceipt: { credits: '8', status: 'success' },
      userId: 'user-1',
      vendorCostRecordedAt: new Date(),
      version: 7,
    };
    const ingredient = asset({
      category,
      generationBilling: receipt,
      id: 'image',
      metadata: null,
      s3Key: 'owned/image.png',
    });
    w.crunTasks.push(task);
    w.assets.push(ingredient);
    const data: CreditDeductionJobData = {
      amount,
      description: receipt.description,
      idempotencyKey: 'media-generation-usage:image',
      metadata: { assetId: 'image', submissionIntentProvider: 'crun' },
      organizationId: 'org-1',
      source: receipt.source,
      type: 'record-byok-usage',
      userId: 'user-1',
    };
    const run = () =>
      w.processor.process({
        attemptsMade: 0,
        data,
        id: 'usage',
        opts: { attempts: 3 },
      } as Job<CreditDeductionJobData>);
    return { data, ingredient, receipt, run, task, w };
  }
  type CrunFixture = ReturnType<typeof crunWorld>;

  const LOCKS = [
    'crun_generation_tasks:org-1:image',
    'ingredients:org-1:image',
  ];

  function proofEntry(amount: number, source: ActivitySource) {
    return {
      actorUserId: 'user-1',
      amount,
      balanceAfter: 100,
      balanceBefore: 100,
      category: CreditTransactionCategory.BYOK_USAGE,
      client: 'proof-transaction',
      description: 'Image generation',
      idempotencyKey: 'byok:org-1:media-generation-usage:image',
      metadata: { assetId: 'image', submissionIntentProvider: 'crun' },
      organizationId: 'org-1',
      source,
    };
  }

  it.each([0, 3])(
    'records exact usage %s once in the serializable proof transaction without altering an active lease',
    async (amount) => {
      const f = crunWorld(amount);
      const lease = f.task.leaseUntil;

      await f.run();
      await f.run();

      expect(f.w.ledger).toEqual([
        proofEntry(amount, ActivitySource.IMAGE_GENERATION),
      ]);
      expect(f.w.balanceReads).toEqual([
        { client: 'proof-transaction', organizationId: 'org-1' },
      ]);
      expect(f.w.transactionAttempts).toEqual([
        { isolationLevel: 'Serializable' },
        { isolationLevel: 'Serializable' },
      ]);
      expect(f.w.locks).toEqual([...LOCKS, ...LOCKS]);
      expect(f.task.leaseUntil).toBe(lease);
      expect(f.task.version).toBe(7);
    },
  );

  it.each(['kling/v2-5-turbo-pro', 'google/veo3-1-fast-t2v'])(
    'records exact video usage for %s once',
    async (endpoint) => {
      const f = crunWorld(3, endpoint, IngredientCategory.VIDEO);

      await f.run();
      await f.run();

      expect(f.w.ledger).toEqual([
        proofEntry(3, ActivitySource.VIDEO_GENERATION),
      ]);
    },
  );

  it.each([
    [
      'a video route for an image asset',
      'kling/v2-5-turbo-pro',
      IngredientCategory.IMAGE,
    ],
    [
      'a video route for an image asset',
      'google/veo3-1-fast-t2v',
      IngredientCategory.IMAGE,
    ],
    [
      'an image route for a video asset',
      'google/nano-banana-pro',
      IngredientCategory.VIDEO,
    ],
    ['an unknown route', 'unknown/video', IngredientCategory.VIDEO],
  ])(
    'refuses %s (%s) without a ledger write',
    async (_name, endpoint, category) => {
      const f = crunWorld(3, endpoint, category);

      await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_IDENTITY_INVALID');

      expect(f.w.ledger).toEqual([]);
    },
  );

  it('refuses a video task whose frozen model names an image route', async () => {
    const f = crunWorld(3, 'kling/v2-5-turbo-pro', IngredientCategory.VIDEO);
    f.task.modelKey = 'crun/google/nano-banana-pro';

    await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_IDENTITY_INVALID');

    expect(f.w.ledger).toEqual([]);
  });

  it('supports previously queued canonical media jobs without a new marker', async () => {
    const f = crunWorld();
    f.data.metadata = { assetId: 'image' };

    await f.run();

    expect(f.w.ledger).toEqual([
      proofEntry(3, ActivitySource.IMAGE_GENERATION),
    ]);
  });

  it('records ordinary incumbent media usage outside the proof transaction', async () => {
    const f = crunWorld();
    f.w.crunTasks.splice(0);
    f.receipt.submissionIntentProvider = 'heygen';
    f.data.metadata = { assetId: 'image' };

    await f.run();

    expect(f.w.transactionAttempts).toEqual([]);
    expect(f.w.ledger).toEqual([
      {
        actorUserId: 'user-1',
        amount: 3,
        balanceAfter: 100,
        balanceBefore: 100,
        category: CreditTransactionCategory.BYOK_USAGE,
        client: 'default',
        description: '[BYOK] Image generation',
        idempotencyKey: 'byok:org-1:media-generation-usage:image',
        metadata: { assetId: 'image' },
        organizationId: 'org-1',
        source: ActivitySource.IMAGE_GENERATION,
      },
    ]);
  });

  it.each<[string, (f: CrunFixture) => void]>([
    ['actor', (f) => Object.assign(f.data, { userId: 'foreign' })],
    ['amount', (f) => Object.assign(f.data, { amount: 4 })],
    [
      'source',
      (f) => Object.assign(f.data, { source: ActivitySource.VIDEO_GENERATION }),
    ],
    ['description', (f) => Object.assign(f.data, { description: 'changed' })],
    [
      'asset',
      (f) =>
        Object.assign(f.data, {
          metadata: { assetId: 'other', submissionIntentProvider: 'crun' },
        }),
    ],
    ['key', (f) => Object.assign(f.data, { idempotencyKey: 'other' })],
    [
      'missing-asset',
      (f) =>
        Object.assign(f.data, {
          metadata: { submissionIntentProvider: 'crun' },
        }),
    ],
    ['missing-ingredient', (f) => f.w.assets.splice(0)],
    [
      'deleted-ingredient',
      (f) => Object.assign(f.ingredient, { isDeleted: true }),
    ],
    [
      'binding',
      (f) => Object.assign(f.task, { fundingBinding: { kind: 'reservation' } }),
    ],
    [
      'free-binding',
      (f) => Object.assign(f.task, { fundingBinding: { kind: 'free' } }),
    ],
    ['model', (f) => Object.assign(f.task, { modelKey: 'foreign' })],
    ['contract', (f) => Object.assign(f.task, { contractVersion: 'changed' })],
    ['input-hash', (f) => Object.assign(f.task, { inputHash: 'd'.repeat(64) })],
    [
      'fingerprint',
      (f) => Object.assign(f.task, { credentialFingerprint: 'd'.repeat(64) }),
    ],
    ['index', (f) => Object.assign(f.task, { outputIndex: 2 })],
    [
      'altered-marker',
      (f) => Object.assign(f.receipt, { submissionIntentProvider: 'heygen' }),
    ],
    [
      'missing-marker',
      (f) => Object.assign(f.receipt, { submissionIntentProvider: '' }),
    ],
  ])(
    'refuses invalid %s permanently without balance or ledger writes',
    async (_field, mutate) => {
      const f = crunWorld();
      mutate(f);

      await expect(f.run()).rejects.toMatchObject({
        message: 'CRUN_BYOK_USAGE_IDENTITY_INVALID',
        name: 'UnrecoverableError',
      });

      expect(f.w.balanceReads).toEqual([]);
      expect(f.w.ledger).toEqual([]);
    },
  );

  it.each([
    ['category', CreditTransactionCategory.DEDUCT, 3],
    ['amount', CreditTransactionCategory.BYOK_USAGE, 4],
  ])(
    'refuses an earlier usage row with a different %s',
    async (_field, category, amount) => {
      const f = crunWorld();
      const earlier = {
        actorUserId: 'user-1',
        amount,
        category,
        idempotencyKey: 'byok:org-1:media-generation-usage:image',
        metadata: { assetId: 'image' },
        organizationId: 'org-1',
        source: ActivitySource.IMAGE_GENERATION,
      };
      f.w.ledger.push(earlier);

      await expect(f.run()).rejects.toThrow(
        'CRUN_BYOK_USAGE_DUPLICATE_CONFLICT',
      );

      expect(f.w.balanceReads).toEqual([]);
      expect(f.w.ledger).toEqual([earlier]);
    },
  );

  it.each<[string, (f: CrunFixture) => void]>([
    ['a missing task', (f) => f.w.crunTasks.splice(0)],
    ['a deleted task', (f) => Object.assign(f.task, { isDeleted: true })],
    [
      'a task of another organization',
      (f) => Object.assign(f.task, { organizationId: 'org-2' }),
    ],
    [
      'unrecorded vendor cost',
      (f) => Object.assign(f.task, { vendorCostRecordedAt: null }),
    ],
    [
      'unpersisted media',
      (f) => Object.assign(f.task, { mediaPersistedAt: null }),
    ],
    ['no owned file', (f) => Object.assign(f.ingredient, { s3Key: '' })],
    ['a polling task', (f) => Object.assign(f.task, { state: 'polling' })],
    [
      'a failed provider task',
      (f) => Object.assign(f.task, { state: 'provider-failed' }),
    ],
    [
      'a terminal receipt conflict',
      (f) =>
        Object.assign(f.task, {
          recoveryCode: 'CRUN_TERMINAL_RECEIPT_CONFLICT',
        }),
    ],
    [
      'a failed usage receipt',
      (f) => Object.assign(f.receipt, { state: 'failed' }),
    ],
  ])(
    'holds %s for retry without acknowledging consumption',
    async (_case, mutate) => {
      const f = crunWorld();
      mutate(f);

      await expect(f.run()).rejects.toMatchObject({
        message: 'CRUN_BYOK_USAGE_HELD',
        name: 'Error',
      });

      expect(f.w.balanceReads).toEqual([]);
      expect(f.w.ledger).toEqual([]);
    },
  );

  it.each(['idempotencyKey', 'organizationId', 'userId'])(
    'refuses a nonstring %s before any read',
    async (field) => {
      const f = crunWorld();
      Object.assign(f.data, { [field]: 42 });

      await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_IDENTITY_INVALID');

      expect(f.w.reads).toEqual([]);
      expect(f.w.balanceReads).toEqual([]);
      expect(f.w.ledger).toEqual([]);
    },
  );

  it('retries a serialization conflict with fresh proof', async () => {
    const f = crunWorld();
    f.w.faults.transaction.push({ code: 'P2034' });

    await f.run();

    expect(f.w.transactionAttempts).toHaveLength(2);
    expect(f.w.ledger).toEqual([
      proofEntry(3, ActivitySource.IMAGE_GENERATION),
    ]);
  });

  it('propagates a conflict that outlasts three attempts', async () => {
    const f = crunWorld();
    f.w.faults.transaction.push(
      { code: 'P2034' },
      { code: 'P2034' },
      { code: 'P2034' },
    );

    await expect(f.run()).rejects.toMatchObject({ code: 'P2034' });

    expect(f.w.transactionAttempts).toHaveLength(3);
    expect(f.w.ledger).toEqual([]);
  });
});
