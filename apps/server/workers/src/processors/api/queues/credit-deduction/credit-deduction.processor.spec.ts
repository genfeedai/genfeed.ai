import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ActivitySource, CreditTransactionCategory } from '@genfeedai/enums';
import type { CreditDeductionJobData } from '@genfeedai/queue-contracts';
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
  let notificationsService: {
    sendLowCreditsAlert: ReturnType<typeof vi.fn>;
  };
  let publisher: { set: ReturnType<typeof vi.fn> };
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let prisma: { ingredient: { findFirst: ReturnType<typeof vi.fn> } };

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
    notificationsService = {
      sendLowCreditsAlert: vi.fn().mockResolvedValue(undefined),
    };
    publisher = { set: vi.fn().mockResolvedValue('OK') };
    redisService = { getPublisher: vi.fn().mockReturnValue(publisher) };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    prisma = { ingredient: { findFirst: vi.fn() } };

    processor = new CreditDeductionProcessor(
      creditsUtilsService as never,
      creditTransactionsService as never,
      notificationsService as never,
      redisService as never,
      logger as never,
      prisma as never,
    );
  });

  it('waits to settle agent media credits until a durable asset is generated', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'asset-1',
      status: 'PROCESSING',
      url: null,
    });

    await expect(
      processor.process(buildJob({ settlementAssetId: 'asset-1' })),
    ).rejects.toThrow('not terminal');
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('emits an operator signal before an unsettled asset exhausts durable retries', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'asset-1',
      status: 'PROCESSING',
    });
    const job = buildJob({ settlementAssetId: 'asset-1' });
    job.attemptsMade = 20_159;
    job.opts.attempts = 20_160;

    await expect(processor.process(job)).rejects.toThrow('not terminal');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('requires operator reconciliation'),
      expect.objectContaining({ assetId: 'asset-1' }),
    );
  });

  it('moves no credits when agent media reaches a terminal failure without an asset', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'asset-1',
      status: 'FAILED',
      url: null,
    });

    await processor.process(
      buildJob({
        reservationId: 'reservation-1',
        settlementAssetId: 'asset-1',
      }),
    );

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
  });

  it('moves no credits when a terminal media row has no user-accessible file', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      cdnUrl: null,
      id: 'asset-1',
      s3Key: null,
      status: 'GENERATED',
    });

    await processor.process(buildJob({ settlementAssetId: 'asset-1' }));

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('settles one referenced charge for a generated user-accessible asset', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      cdnUrl: 'https://cdn.genfeed.ai/images/asset-1.png',
      id: 'asset-1',
      s3Key: 'images/asset-1.png',
      status: 'GENERATED',
    });

    await processor.process(
      buildJob({
        idempotencyKey: 'agent-media-action-1',
        referenceId: 'action-1',
        referenceType: 'agent-media:generation',
        reservationId: 'reservation-1',
        settlementAssetId: 'asset-1',
      }),
    );

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledTimes(1);
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith({
      actualAmount: 10,
      actorUserId: 'user-1',
      description: 'Image generation',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      source: ActivitySource.IMAGE_GENERATION,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
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
    expect(notificationsService.sendLowCreditsAlert).toHaveBeenCalledWith(
      'org-1',
      500,
    );
  });

  it('debounces the low-credits alert when the redis key is already set', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);
    publisher.set.mockResolvedValue(null);

    await processor.process(buildJob({}));

    expect(notificationsService.sendLowCreditsAlert).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  it('skips the low-credits alert when redis is unavailable', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);
    redisService.getPublisher.mockReturnValue(null);

    await processor.process(buildJob({}));

    expect(notificationsService.sendLowCreditsAlert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never fails the job when the low-credits check fails', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockRejectedValue(
      new Error('balance lookup failed'),
    );

    await expect(processor.process(buildJob({}))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
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
