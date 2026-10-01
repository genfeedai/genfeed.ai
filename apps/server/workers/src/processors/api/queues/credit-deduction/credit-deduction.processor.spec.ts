import type { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { currentWorkflowAccountingScope } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CreditDeductionProcessor', () => {
  let processor: CreditDeductionProcessor;
  let creditsUtilsService: {
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
    releaseReservation: ReturnType<typeof vi.fn>;
    settleReservation: ReturnType<typeof vi.fn>;
  };
  let creditTransactionsService: {
    createTransactionEntry: ReturnType<typeof vi.fn>;
  };
  let activityRecorder: {
    record: ReturnType<typeof vi.fn>;
  };
  let publisher: { set: ReturnType<typeof vi.fn> };
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    ingredient: { findFirst: ReturnType<typeof vi.fn> };
    crunGenerationTask: { findFirst: ReturnType<typeof vi.fn> };
    metadata: { updateMany: ReturnType<typeof vi.fn> };
    workflowExecution: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(5000),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      settleReservation: vi.fn().mockResolvedValue(undefined),
    };
    creditTransactionsService = {
      createTransactionEntry: vi.fn().mockResolvedValue(undefined),
    };
    activityRecorder = {
      record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    publisher = { set: vi.fn().mockResolvedValue('OK') };
    redisService = { getPublisher: vi.fn().mockReturnValue(publisher) };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    prisma = {
      ingredient: { findFirst: vi.fn() },
      crunGenerationTask: { findFirst: vi.fn().mockResolvedValue(null) },
      metadata: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    processor = new CreditDeductionProcessor(
      creditsUtilsService as never,
      creditTransactionsService as never,
      activityRecorder as never,
      redisService as never,
      logger as never,
      prisma as never,
    );
  });

  it('restores accepted provider identity before retrying the same reservation settlement', async () => {
    const job = buildJob({
      acceptedGeneration: { ingredientId: 'asset', externalId: 'provider-id' },
      reservationId: 'hold',
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      metadata: { id: 'meta', externalId: null, isDeleted: false },
    });
    creditsUtilsService.settleReservation.mockRejectedValueOnce(
      new Error('database busy'),
    );
    await expect(processor.process(job)).rejects.toThrow('database busy');
    prisma.ingredient.findFirst.mockResolvedValue({
      metadata: { id: 'meta', externalId: 'provider-id', isDeleted: false },
    });
    await processor.process(job);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'asset',
          organizationId: job.data.organizationId,
          isDeleted: false,
        },
      }),
    );
    expect(prisma.metadata.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'meta',
        isDeleted: false,
        ingredients: {
          some: {
            id: 'asset',
            organizationId: job.data.organizationId,
            isDeleted: false,
          },
        },
        OR: [{ externalId: null }, { externalId: 'provider-id' }],
      },
      data: { externalId: 'provider-id' },
    });
    expect(prisma.metadata.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      creditsUtilsService.settleReservation.mock.invocationCallOrder[0],
    );
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledTimes(2);
    expect(creditsUtilsService.settleReservation.mock.calls[0]).toEqual(
      creditsUtilsService.settleReservation.mock.calls[1],
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {
      metadata: {
        id: 'meta',
        externalId: 'other-provider-id',
        isDeleted: false,
      },
    },
  ])(
    'rejects missing tenant asset or conflicting provider identity before charging',
    async (asset) => {
      prisma.ingredient.findFirst.mockResolvedValue(asset);
      const job = buildJob({
        acceptedGeneration: {
          ingredientId: 'asset',
          externalId: 'provider-id',
        },
        reservationId: 'hold',
      });
      await expect(processor.process(job)).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
      expect(prisma.metadata.updateMany).not.toHaveBeenCalled();
      expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
      expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
    },
  );

  it('retries accepted BYOK tracking using one durable ledger key without GEN deductions', async () => {
    const job = buildJob({
      type: 'record-byok-usage',
      idempotencyKey: 'interpolation-asset',
      acceptedGeneration: { ingredientId: 'asset', externalId: 'provider-id' },
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      metadata: { id: 'meta', externalId: null, isDeleted: false },
    });
    creditTransactionsService.createTransactionEntry.mockRejectedValueOnce(
      new Error('ledger unavailable'),
    );
    await expect(processor.process(job)).rejects.toThrow('ledger unavailable');
    await processor.process(job);
    expect(
      creditTransactionsService.createTransactionEntry.mock.calls[0],
    ).toEqual(creditTransactionsService.createTransactionEntry.mock.calls[1]);
    expect(
      creditTransactionsService.createTransactionEntry.mock.calls[1].at(-1),
    ).toEqual({
      idempotencyKey: `byok:${job.data.organizationId}:interpolation-asset`,
      actorUserId: job.data.userId,
      metadata: job.data.metadata,
    });
    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('deducts a trusted queued charge when its execution is deleted or unavailable, without attaching its scope', async () => {
    const job = buildJob({});
    job.data.workflowAccounting = {
      organizationId: job.data.organizationId,
      workflowExecutionId: 'unavailable',
      workflowNodeId: 'node',
      workflowOperationId: 'attempt',
    };
    creditsUtilsService.deductCreditsFromOrganization.mockImplementation(
      async () => {
        expect(currentWorkflowAccountingScope()).toBeUndefined();
      },
    );
    await processor.process(job);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'unavailable',
        organizationId: job.data.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
  });
  it('rejects a forged organization scope before charging', async () => {
    const job = buildJob({});
    job.data.workflowAccounting = {
      organizationId: 'foreign',
      workflowExecutionId: 'run',
      workflowNodeId: 'node',
      workflowOperationId: 'attempt',
    };
    await expect(processor.process(job)).rejects.toThrow('does not match');
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
  });
  it('settles a media-generation hold once through the reserved branch, forwarding its metadata', async () => {
    await processor.process(
      buildJob({
        idempotencyKey: 'media-generation-settle:hold-1',
        metadata: { assetId: 'asset-1', marginMultiplier: 3.33 },
        reservationId: 'hold-1',
      }),
    );

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledTimes(1);
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith({
      actualAmount: 10,
      actorUserId: 'user-1',
      description: 'Image generation',
      metadata: { assetId: 'asset-1', marginMultiplier: 3.33 },
      organizationId: 'org-1',
      reservationId: 'hold-1',
      source: ActivitySource.IMAGE_GENERATION,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(prisma.ingredient.findFirst).not.toHaveBeenCalled();
  });

  it('passes completion billing references into the credit utility', async () => {
    const data: CreditDeductionJobData = {
      amount: 18,
      description: 'Fleet voice clone compute',
      idempotencyKey: 'fleet-voice-clone-job-1',
      metadata: {
        fleetJobId: 'job-1',
        processTimeSeconds: 61,
      },
      organizationId: 'org-1',
      referenceId: 'job-1',
      referenceType: 'fleet:voice-clone',
      source: ActivitySource.VOICE_GENERATION,
      type: 'deduct-credits',
      userId: 'user-1',
    };

    await processor.process({
      attemptsMade: 0,
      data,
      id: 'credit-deduct-org-1-fleet-voice-clone-job-1',
      opts: { attempts: 3 },
    } as Job<CreditDeductionJobData>);

    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      18,
      'Fleet voice clone compute',
      ActivitySource.VOICE_GENERATION,
      {
        idempotencyKey: 'fleet-voice-clone-job-1',
        maxOverdraftCredits: undefined,
        metadata: {
          fleetJobId: 'job-1',
          processTimeSeconds: 61,
        },
        referenceId: 'job-1',
        referenceType: 'fleet:voice-clone',
      },
    );
  });

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

  it('forwards the job metadata when settling a reservation', async () => {
    await processor.process(
      buildJob({
        metadata: { assetId: 'asset-1', pricingType: 'per-image' },
        reservationId: 'reservation-1',
      }),
    );

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 10,
        metadata: { assetId: 'asset-1', pricingType: 'per-image' },
        reservationId: 'reservation-1',
      }),
    );
  });

  it('throws an UnrecoverableError when a deduction job has no userId', async () => {
    await expect(
      processor.process(buildJob({ userId: undefined })),
    ).rejects.toThrow(UnrecoverableError);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('sends a low-credits alert once when the balance drops below the threshold', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);

    await processor.process(buildJob({}));

    expect(publisher.set).toHaveBeenCalledWith(
      'low-credits-notified:org-1',
      '1',
      'EX',
      86400,
      'NX',
    );
    expect(activityRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: expect.objectContaining({
          deduplicationKey: expect.stringMatching(/^credits-low\/org-1\/\d+$/),
          operatorMessages: {
            discord: {
              action: 'low_credits_alert',
              payload: { balance: 500, organizationId: 'org-1' },
              type: 'discord',
            },
          },
        }),
        key: ActivityKey.CREDITS_LOW,
        organizationId: 'org-1',
      }),
    );
  });

  it('debounces the low-credits alert when the redis key is already set', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);
    publisher.set.mockResolvedValue(null);

    await processor.process(buildJob({}));

    expect(activityRecorder.record).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  it('skips the low-credits alert when redis is unavailable', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);
    redisService.getPublisher.mockReturnValue(null);

    await processor.process(buildJob({}));

    expect(activityRecorder.record).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never fails the job when the low-credits check fails', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockRejectedValue(
      new Error('balance lookup failed'),
    );

    await expect(processor.process(buildJob({}))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('preserves the completion gate on legacy jobs already in Redis', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'legacy-asset',
      status: 'PROCESSING',
    } as never);
    await expect(
      processor.process(buildJob({ settlementAssetId: 'legacy-asset' })),
    ).rejects.toThrow('not terminal');
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('skips failed legacy media jobs without charging', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'legacy-asset',
      status: 'FAILED',
    } as never);
    await processor.process(
      buildJob({
        settlementAssetId: 'legacy-asset',
        reservationId: 'legacy-hold',
      }),
    );
    expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'legacy-hold',
    });
    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
  });

  it('retains canonical actor and output attribution in BYOK usage evidence', async () => {
    await processor.process(
      buildJob({
        type: 'record-byok-usage',
        userId: 'canonical-user',
        metadata: { assetId: 'asset-1' },
      }),
    );
    expect(
      creditTransactionsService.createTransactionEntry,
    ).toHaveBeenCalledWith(
      'org-1',
      CreditTransactionCategory.BYOK_USAGE,
      expect.any(Number),
      5000,
      5000,
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
      expect.objectContaining({
        actorUserId: 'canonical-user',
        metadata: { assetId: 'asset-1' },
      }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('records BYOK usage as a zero-balance-change ledger entry', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(1234);

    await processor.process(
      buildJob({
        amount: 3,
        description: 'BYOK image call',
        type: 'record-byok-usage',
      }),
    );

    expect(
      creditTransactionsService.createTransactionEntry,
    ).toHaveBeenCalledWith(
      'org-1',
      CreditTransactionCategory.BYOK_USAGE,
      3,
      1234,
      1234,
      ActivitySource.IMAGE_GENERATION,
      '[BYOK] BYOK image call',
      undefined,
      undefined,
      {
        idempotencyKey: 'byok:org-1:job-1',
        actorUserId: 'user-1',
        metadata: undefined,
      },
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('converts BusinessLogicException into an UnrecoverableError', async () => {
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new BusinessLogicException('insufficient credits'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow(
      UnrecoverableError,
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('rethrows transient errors so BullMQ retries', async () => {
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('db timeout'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow('db timeout');
  });
});

describe('Crun media BYOK consumer authority', () => {
  function fixture(amount = 3) {
    const receipt = {
      kind: 'byok',
      state: 'pending',
      amount,
      description: 'Image generation',
      expiresAt: '2099-01-01T00:00:00.000Z',
      source: ActivitySource.IMAGE_GENERATION,
      userId: 'user-1',
      submissionIntentProvider: 'crun',
    };
    const { kind: _kind, state: _state, ...immutable } = receipt;
    const priced = quoteModelBillablePricing(
      billableProfile({
        key: 'crun/google/nano-banana-pro',
        provider: 'crun',
        cost: amount,
        isFree: amount === 0,
      }),
      {
        modelKey: 'crun/google/nano-banana-pro',
        provider: 'crun',
        outputs: 1,
        requests: 1,
      },
      1,
      new Date().toISOString(),
    );
    if (priced.status !== 'priced') throw new Error('Invalid fixture quote');
    const quote = {
      ...priced.snapshot,
      providerQuote: {
        provider: 'crun',
        estimated: false,
        providerCreditsPerTask: '8',
        quoteHash: 'a'.repeat(64),
        inputHash: 'b'.repeat(64),
        contractVersion: 'v1',
        creditsPerUsd: null,
        acquisitionRateVersion: null,
        credentialSource: 'byok',
        credentialId: null,
        credentialFingerprint: 'c'.repeat(64),
      },
    };
    const task = {
      organizationId: 'org-1',
      ingredientId: 'image',
      userId: 'user-1',
      credentialSource: 'byok',
      reservationId: null,
      fundingBinding: { kind: 'byok', receipt: immutable },
      quoteSnapshot: quote,
      modelKey: quote.modelKey,
      endpoint: 'google/nano-banana-pro',
      contractVersion: 'v1',
      inputHash: 'b'.repeat(64),
      credentialId: null,
      credentialFingerprint: 'c'.repeat(64),
      outputIndex: 0,
      state: 'provider-success',
      terminalReceipt: { status: 'success', credits: '8' },
      vendorCostRecordedAt: new Date(),
      mediaPersistedAt: new Date(),
      recoveryCode: null,
      leaseUntil: new Date(Date.now() + 60000),
      version: 7,
    };
    const ingredient = {
      userId: 'user-1',
      status: 'GENERATED',
      s3Key: 'owned/image.png',
      generationBilling: receipt,
    };
    const state: {
      task: Record<string, unknown> | null;
      ingredient: Record<string, unknown> | null;
      ledger: Record<string, unknown> | null;
    } = { task, ingredient, ledger: null };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      crunGenerationTask: { findFirst: vi.fn(async () => state.task) },
      ingredient: { findFirst: vi.fn(async () => state.ingredient) },
      creditTransaction: { findFirst: vi.fn(async () => state.ledger) },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<void>) =>
          operation(tx),
      ),
    };
    const balance = vi.fn().mockResolvedValue(100);
    const create = vi.fn(
      async (
        ...args: Parameters<CreditTransactionsService['createTransactionEntry']>
      ) => {
        const [, category, value, , , source, , , , options] = args;
        if (!options) throw new Error('Missing ledger identity');
        state.ledger = {
          category,
          amount: value,
          source,
          actorUserId: options.actorUserId,
          metadata: options.metadata,
        };
      },
    );
    const logger = { log: vi.fn(), error: vi.fn() };
    const processor = new CreditDeductionProcessor(
      { getOrganizationCreditsBalance: balance } as never,
      { createTransactionEntry: create } as never,
      {} as never,
      {} as never,
      logger as never,
      prisma as never,
    );
    const data: CreditDeductionJobData = {
      type: 'record-byok-usage',
      organizationId: 'org-1',
      userId: 'user-1',
      amount,
      description: receipt.description,
      source: receipt.source,
      idempotencyKey: 'media-generation-usage:image',
      metadata: { assetId: 'image', submissionIntentProvider: 'crun' },
    };
    const run = () =>
      processor.process({
        data,
        id: 'usage',
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<CreditDeductionJobData>);
    return { task, ingredient, state, tx, prisma, balance, create, data, run };
  }
  it.each([0, 3])(
    'records exact usage %s once in the proof transaction without altering an active lease',
    async (amount) => {
      const f = fixture(amount);
      const lease = f.task.leaseUntil;
      await f.run();
      await f.run();
      expect(f.create).toHaveBeenCalledTimes(1);
      expect(f.balance).toHaveBeenCalledWith('org-1', f.tx);
      expect(f.create.mock.calls[0]?.[8]).toBe(f.tx);
      expect(f.create.mock.calls[0]?.[1]).toBe(
        CreditTransactionCategory.BYOK_USAGE,
      );
      expect(f.create.mock.calls[0]?.slice(3, 5)).toEqual([100, 100]);
      expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(4);
      expect(f.task.leaseUntil).toBe(lease);
      expect(f.task.version).toBe(7);
    },
  );
  it('supports previously queued canonical media jobs without a new marker', async () => {
    const f = fixture();
    f.data.metadata = { assetId: 'image' };
    await f.run();
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it('retains ordinary incumbent media usage behavior', async () => {
    const f = fixture();
    f.state.task = null;
    f.ingredient.generationBilling = {
      ...f.ingredient.generationBilling,
      submissionIntentProvider: 'heygen',
    };
    f.data.metadata = { assetId: 'image' };
    await f.run();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.create.mock.calls[0]?.[8]).toBeUndefined();
  });
  it.each([
    'actor',
    'organization',
    'amount',
    'source',
    'description',
    'asset',
    'key',
    'missing-asset',
    'missing-ingredient',
    'deleted-ingredient',
    'binding',
    'free-binding',
    'model',
    'contract',
    'input-hash',
    'fingerprint',
    'index',
    'duplicate-category',
    'duplicate-amount',
  ])('rejects invalid %s without balance or ledger writes', async (field) => {
    const f = fixture();
    if (field === 'actor') f.data.userId = 'foreign';
    if (field === 'organization') f.task.organizationId = 'foreign';
    if (field === 'amount') f.data.amount++;
    if (field === 'source') f.data.source = ActivitySource.VIDEO_GENERATION;
    if (field === 'description') f.data.description = 'changed';
    if (field === 'asset')
      f.data.metadata = { assetId: 'other', submissionIntentProvider: 'crun' };
    if (field === 'key') f.data.idempotencyKey = 'other';
    if (field === 'missing-asset')
      f.data.metadata = { submissionIntentProvider: 'crun' };
    if (field === 'missing-ingredient' || field === 'deleted-ingredient')
      f.state.ingredient = null;
    if (field === 'binding' || field === 'free-binding')
      f.state.task = {
        ...f.task,
        fundingBinding: { kind: field === 'binding' ? 'reservation' : 'free' },
      };
    if (field === 'model') f.task.modelKey = 'foreign';
    if (field === 'contract') f.task.contractVersion = 'changed';
    if (field === 'input-hash') f.task.inputHash = 'd'.repeat(64);
    if (field === 'fingerprint') f.task.credentialFingerprint = 'd'.repeat(64);
    if (field === 'index') f.task.outputIndex = 2;
    if (field.startsWith('duplicate-'))
      f.state.ledger = {
        category:
          field === 'duplicate-category'
            ? CreditTransactionCategory.DEDUCT
            : CreditTransactionCategory.BYOK_USAGE,
        actorUserId: 'user-1',
        amount: field === 'duplicate-amount' ? 4 : 3,
        source: f.data.source,
        metadata: { assetId: 'image' },
      };
    await expect(f.run()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(f.balance).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each([
    'missing-task',
    'deleted-task',
    'altered-marker',
    'missing-vendor',
    'missing-media',
    'missing-owned-key',
    'nonterminal',
    'failed',
    'conflict',
    'receipt-failed',
    'missing-marker',
  ])('holds %s proof without acknowledging consumption', async (field) => {
    const f = fixture();
    if (field === 'missing-task' || field === 'deleted-task')
      f.state.task = null;
    if (field === 'altered-marker')
      f.ingredient.generationBilling.submissionIntentProvider = 'heygen';
    if (field === 'missing-vendor')
      f.state.task = { ...f.task, vendorCostRecordedAt: null };
    if (field === 'missing-media')
      f.state.task = { ...f.task, mediaPersistedAt: null };
    if (field === 'missing-owned-key') f.ingredient.s3Key = '';
    if (field === 'nonterminal') f.task.state = 'polling';
    if (field === 'failed') f.task.state = 'provider-failed';
    if (field === 'conflict')
      f.state.task = {
        ...f.task,
        recoveryCode: 'CRUN_TERMINAL_RECEIPT_CONFLICT',
      };
    if (field === 'receipt-failed')
      f.ingredient.generationBilling.state = 'failed';
    if (field === 'missing-marker')
      f.ingredient.generationBilling.submissionIntentProvider = '';
    await expect(f.run()).rejects.toThrow();
    expect(f.balance).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each(['idempotencyKey', 'organizationId', 'userId'] as const)(
    'rejects a nonstring %s before classification reads',
    async (field) => {
      const f = fixture();
      Object.assign(f.data, { [field]: 42 });
      await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_IDENTITY_INVALID');
      expect(f.tx.ingredient.findFirst).not.toHaveBeenCalled();
      expect(f.tx.crunGenerationTask.findFirst).not.toHaveBeenCalled();
      expect(f.balance).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    },
  );
  it('retries serialization conflicts with fresh proof and propagates exhausted conflicts', async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await f.run();
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(2);
    const exhausted = fixture();
    exhausted.prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(exhausted.run()).rejects.toMatchObject({ code: 'P2034' });
    expect(exhausted.prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
