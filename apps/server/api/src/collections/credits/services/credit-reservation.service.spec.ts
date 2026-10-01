import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';

describe('CreditReservationService', () => {
  const prisma = {
    crunGenerationTask: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    organization: { findMany: vi.fn() },
    creditReservation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditTransaction: { updateMany: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    liveSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const creditBalanceService = {
    applyDelta: vi.fn(),
    getOrCreateBalance: vi.fn(),
    toSnapshot: vi.fn(),
  };
  const creditTransactionsService = {
    createTransactionEntry: vi.fn(),
  };
  const txClient = prisma as unknown as PrismaTransactionClient;
  const transactionUtil = {
    runInTransaction: vi.fn(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) =>
        fn(txClient),
    ),
  };

  const service = new CreditReservationService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
    creditBalanceService as unknown as CreditBalanceService,
    creditTransactionsService as unknown as CreditTransactionsService,
    transactionUtil as unknown as TransactionUtil,
  );

  function mockDueReservations(rows: Array<Record<string, unknown>>): void {
    prisma.creditReservation.findMany.mockImplementation(async (args) =>
      rows.filter((row) => row.organizationId === args.where.organizationId),
    );
  }

  beforeEach(() => {
    prisma.crunGenerationTask.findFirst.mockReset().mockResolvedValue(null);
    prisma.crunGenerationTask.findMany.mockReset().mockResolvedValue([]);
    prisma.organization.findMany
      .mockReset()
      .mockResolvedValue([{ id: 'org_1' }, { id: 'org_2' }]);
    prisma.creditReservation.create.mockReset();
    prisma.creditReservation.findFirst.mockReset();
    prisma.creditReservation.findMany.mockReset();
    prisma.creditReservation.update.mockReset();
    prisma.creditReservation.updateMany
      .mockReset()
      .mockResolvedValue({ count: 1 });
    prisma.creditTransaction.updateMany.mockReset();
    prisma.liveSession.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.ingredient.findFirst.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    logger.log.mockReset();
    creditBalanceService.applyDelta.mockReset();
    creditBalanceService.getOrCreateBalance.mockReset();
    creditBalanceService.toSnapshot.mockReset();
    creditTransactionsService.createTransactionEntry.mockReset();
    transactionUtil.runInTransaction.mockClear();
    creditBalanceService.applyDelta.mockResolvedValue({
      available: 80,
      billingAccountId: 'ba_1',
      held: 20,
      id: 'bal_1',
      organizationId: 'org_1',
      settled: 100,
      version: 2,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is idempotent for an existing reservation key', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({
      actorUserId: 'user_1',
      amount: 20,
      billingAccountId: 'ba_1',
      createdAt: new Date('2026-08-27T00:00:00Z'),
      expiresAt: new Date('2026-08-27T02:00:00Z'),
      id: 'res_1',
      idempotencyKey: 'gen_1',
      isDeleted: false,
      organizationId: 'org_1',
      settledAmount: null,
      status: CreditReservationStatus.RESERVED,
      updatedAt: new Date('2026-08-27T00:00:00Z'),
      workloadId: 'job_1',
      workloadType: 'generation',
    });

    const result = await service.reserve({
      actorUserId: 'user_1',
      amount: 20,
      billingAccountId: 'ba_1',
      idempotencyKey: 'gen_1',
      organizationId: 'org_1',
    });

    expect(result.id).toBe('res_1');
    expect(prisma.creditReservation.findFirst).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'gen_1',
        isDeleted: false,
        organizationId: 'org_1',
      },
    });
    expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
  });

  it.each(['40001', '40P01'])(
    'retries reservation wallet conflicts with SQLSTATE %s',
    async (sqlState) => {
      prisma.creditReservation.findFirst.mockResolvedValue(null);
      prisma.creditReservation.create.mockResolvedValue({
        id: 'res_retry',
        organizationId: 'org_1',
        billingAccountId: 'ba_1',
        actorUserId: 'user_1',
        amount: 20,
        settledAmount: null,
        status: CreditReservationStatus.RESERVED,
        idempotencyKey: 'retry_1',
        workloadType: null,
        workloadId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(),
        isDeleted: false,
      });
      creditBalanceService.applyDelta.mockRejectedValueOnce({
        code: 'P2010',
        meta: {
          driverAdapterError: Object.assign(new Error('DriverAdapterError'), {
            cause: { originalCode: sqlState, kind: 'TransactionWriteConflict' },
          }),
        },
      });
      const result = await service.reserve({
        organizationId: 'org_1',
        billingAccountId: 'ba_1',
        actorUserId: 'user_1',
        amount: 20,
        idempotencyKey: 'retry_1',
      });
      expect(result.id).toBe('res_retry');
      expect(transactionUtil.runInTransaction).toHaveBeenCalledTimes(2);
      expect(prisma.creditReservation.create).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry unrelated raw reservation errors', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue(null);
    const error = { code: 'P2010', meta: { code: '23514' } };
    creditBalanceService.applyDelta.mockRejectedValueOnce(error);
    await expect(
      service.reserve({
        organizationId: 'org_1',
        billingAccountId: 'ba_1',
        actorUserId: 'user_1',
        amount: 20,
        idempotencyKey: 'retry_1',
      }),
    ).rejects.toBe(error);
    expect(transactionUtil.runInTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.creditReservation.create).not.toHaveBeenCalled();
  });

  it('stops retrying raw reservation conflicts after three attempts', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue(null);
    const error = { code: 'P2010', meta: { code: '40001' } };
    creditBalanceService.applyDelta
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);
    await expect(
      service.reserve({
        organizationId: 'org_1',
        billingAccountId: 'ba_1',
        actorUserId: 'user_1',
        amount: 20,
        idempotencyKey: 'retry_1',
      }),
    ).rejects.toBe(error);
    expect(transactionUtil.runInTransaction).toHaveBeenCalledTimes(3);
    expect(prisma.creditReservation.create).not.toHaveBeenCalled();
  });

  it('rejects settlement above the reserved amount', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({
      amount: 20,
      billingAccountId: 'ba_1',
      id: 'res_1',
      organizationId: 'org_1',
      status: CreditReservationStatus.RESERVED,
    });

    await expect(
      service.settle({
        actualAmount: 25,
        actorUserId: 'user_1',
        description: 'too much',
        organizationId: 'org_1',
        reservationId: 'res_1',
      }),
    ).rejects.toBeInstanceOf(BusinessLogicException);
    expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
  });

  it('moves the wallet only after atomically claiming a reserved settlement', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({
      amount: 20,
      billingAccountId: 'ba_1',
      id: 'res_1',
      organizationId: 'org_1',
      status: CreditReservationStatus.RESERVED,
    });

    await service.settle({
      actualAmount: 15,
      actorUserId: 'user_1',
      description: 'generation complete',
      organizationId: 'org_1',
      reservationId: 'res_1',
    });

    expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
      data: {
        settledAmount: 15,
        status: CreditReservationStatus.SETTLED,
      },
      where: {
        id: 'res_1',
        isDeleted: false,
        organizationId: 'org_1',
        status: CreditReservationStatus.RESERVED,
      },
    });
    expect(creditBalanceService.applyDelta).toHaveBeenCalledTimes(1);
  });

  it.each([null, 'reserved-run'])(
    'preserves transaction attribution when reservation run is %s',
    async (workflowExecutionId) => {
      prisma.creditReservation.findFirst.mockResolvedValue({
        amount: 20,
        billingAccountId: 'ba_1',
        id: 'res_1',
        organizationId: 'org_1',
        status: CreditReservationStatus.RESERVED,
        workflowExecutionId,
        workflowNodeId: workflowExecutionId ? 'reserved-node' : null,
        workflowOperationId: workflowExecutionId ? 'reserved-operation' : null,
      });
      const transaction: Record<string, unknown> = {};
      creditTransactionsService.createTransactionEntry.mockImplementation(
        async () => {
          Object.assign(transaction, {
            workflowExecutionId: 'current-run',
            workflowNodeId: 'current-node',
            workflowOperationId: 'current-operation',
          });
        },
      );
      prisma.creditTransaction.updateMany.mockImplementation(
        async ({ data }) => {
          Object.assign(transaction, data);
          return { count: 1 };
        },
      );
      await service.settle({
        actualAmount: 15,
        actorUserId: 'user_1',
        description: 'complete',
        organizationId: 'org_1',
        reservationId: 'res_1',
      });
      expect(transaction).toMatchObject({
        workflowExecutionId: workflowExecutionId ?? 'current-run',
        workflowNodeId: workflowExecutionId ? 'reserved-node' : 'current-node',
        workflowOperationId: workflowExecutionId
          ? 'reserved-operation'
          : 'current-operation',
      });
    },
  );

  it('treats a settlement claim lost to a concurrent caller as an idempotent replay', async () => {
    prisma.creditReservation.findFirst
      .mockResolvedValueOnce({
        amount: 20,
        billingAccountId: 'ba_1',
        id: 'res_1',
        organizationId: 'org_1',
        status: CreditReservationStatus.RESERVED,
      })
      .mockResolvedValueOnce({
        amount: 20,
        billingAccountId: 'ba_1',
        id: 'res_1',
        organizationId: 'org_1',
        settledAmount: 15,
        status: CreditReservationStatus.SETTLED,
      });
    prisma.creditReservation.updateMany.mockResolvedValueOnce({ count: 0 });
    creditBalanceService.getOrCreateBalance.mockResolvedValue({
      balance: 85,
      billingAccountId: 'ba_1',
      heldAmount: 0,
      id: 'bal_1',
      isDeleted: false,
      organizationId: 'org_1',
      version: 3,
    });
    creditBalanceService.toSnapshot.mockReturnValue({
      available: 85,
      billingAccountId: 'ba_1',
      held: 0,
      id: 'bal_1',
      organizationId: 'org_1',
      settled: 85,
      version: 3,
    });

    await expect(
      service.settle({
        actualAmount: 15,
        actorUserId: 'user_1',
        description: 'generation complete',
        organizationId: 'org_1',
        reservationId: 'res_1',
      }),
    ).resolves.toMatchObject({ settled: 85 });

    expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
    expect(
      creditTransactionsService.createTransactionEntry,
    ).not.toHaveBeenCalled();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid settlement amount of %s',
    async (actualAmount) => {
      prisma.creditReservation.findFirst.mockResolvedValue({
        amount: 20,
        billingAccountId: 'ba_1',
        id: 'res_1',
        organizationId: 'org_1',
        status: CreditReservationStatus.RESERVED,
      });

      await expect(
        service.settle({
          actualAmount,
          actorUserId: 'user_1',
          description: 'invalid amount',
          organizationId: 'org_1',
          reservationId: 'res_1',
        }),
      ).rejects.toBeInstanceOf(BusinessLogicException);
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
    },
  );

  it('scopes reservation identities to the owning organization', async () => {
    prisma.creditReservation.findFirst.mockResolvedValue(null);

    await expect(
      service.settle({
        actualAmount: 10,
        actorUserId: 'user_1',
        description: 'wrong organization',
        organizationId: 'org_2',
        reservationId: 'res_1',
      }),
    ).rejects.toBeInstanceOf(BusinessLogicException);
    expect(prisma.creditReservation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'res_1',
        isDeleted: false,
        organizationId: 'org_2',
      },
    });
  });

  it.each(['settle', 'release'])(
    'rejects a stale completion snapshot before %s changes the wallet',
    async (action) => {
      const metadata = { completedArtifacts: [] };
      prisma.creditReservation.findFirst.mockResolvedValue({
        id: 'res_1',
        organizationId: 'org_1',
        amount: 12,
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        status: CreditReservationStatus.RESERVED,
        metadata: { completedArtifacts: ['late-completion'] },
      });
      prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 });
      const identity = {
        reservationId: 'res_1',
        organizationId: 'org_1',
        expectedReservationMetadata: metadata,
      };
      const result =
        action === 'settle'
          ? service.settle({
              ...identity,
              actualAmount: 4,
              actorUserId: 'user_1',
              description: 'partial',
            })
          : service.release(identity);
      await expect(result).rejects.toBeInstanceOf(
        ReservationEvidenceChangedException,
      );
      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ metadata: { equals: metadata } }),
        }),
      );
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
    },
  );

  it('returns held credits to the balance when a failed generation releases its reservation', async () => {
    const reservation = {
      id: 'res_1',
      organizationId: 'org_1',
      billingAccountId: 'ba_1',
      actorUserId: 'user_1',
      amount: 12,
      status: CreditReservationStatus.RESERVED,
      workloadType: 'image_generation',
      workloadId: 'ingredient_1',
    };
    prisma.creditReservation.findFirst.mockResolvedValue(reservation);
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    creditBalanceService.applyDelta.mockResolvedValue({
      available: 100,
      billingAccountId: 'ba_1',
      held: 0,
      id: 'bal_1',
      organizationId: 'org_1',
      settled: 100,
      version: 3,
    });

    const snapshot = await service.release({
      organizationId: 'org_1',
      reason: 'release',
      reservationId: 'res_1',
    });

    expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
      data: { status: CreditReservationStatus.RELEASED },
      where: {
        id: 'res_1',
        isDeleted: false,
        organizationId: 'org_1',
        status: CreditReservationStatus.RESERVED,
      },
    });
    expect(creditBalanceService.applyDelta).toHaveBeenCalledWith(
      'org_1',
      {
        billingAccountId: 'ba_1',
        heldDelta: -12,
      },
      txClient,
      'res_1',
    );
    expect(snapshot.held).toBe(0);
    expect(snapshot.available).toBe(100);
  });

  it('scopes each expiry candidate query to its owning organization', async () => {
    mockDueReservations([]);
    await service.expireDue();
    expect(prisma.creditReservation.findMany).toHaveBeenCalledTimes(2);
    expect(
      prisma.creditReservation.findMany.mock.calls.map(
        ([args]) => args.where.organizationId,
      ),
    ).toEqual(['org_1', 'org_2']);
    for (const [args] of prisma.creditReservation.findMany.mock.calls)
      expect(args.where.isDeleted).toBe(false);
  });

  it('settles accepted interpolation at its held quote without releasing it', async () => {
    const reservation = {
      id: 'hold',
      organizationId: 'org_1',
      actorUserId: 'user_1',
      amount: 50,
      workloadType: 'interpolation',
      workloadId: 'asset',
    };
    mockDueReservations([reservation]);
    prisma.ingredient.findFirst.mockResolvedValue({
      metadata: { externalId: 'provider-id', isDeleted: false },
    });
    const settle = vi.spyOn(service, 'settle').mockResolvedValue({} as never);
    const release = vi.spyOn(service, 'release');
    await expect(service.expireDue()).resolves.toBe(1);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset', organizationId: 'org_1', isDeleted: false },
      }),
    );
    expect(settle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actualAmount: 50,
        actorUserId: 'user_1',
        organizationId: 'org_1',
        reservationId: 'hold',
      }),
    );
    expect(release).not.toHaveBeenCalled();
  });

  it('releases only confirmed failed unaccepted interpolation holds', async () => {
    mockDueReservations([
      {
        id: 'hold',
        organizationId: 'org_1',
        actorUserId: 'user_1',
        amount: 5,
        workloadType: 'interpolation',
        workloadId: 'asset',
      },
    ]);
    prisma.ingredient.findFirst.mockResolvedValue({
      status: 'FAILED',
      metadata: { externalId: null, isDeleted: false },
    });
    const release = vi.spyOn(service, 'release').mockResolvedValue({} as never);
    await expect(service.expireDue()).resolves.toBe(1);
    expect(release).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org_1',
      reservationId: 'hold',
      reason: 'expiry',
    });
  });

  it.each([null, { metadata: { externalId: null, isDeleted: false } }])(
    'retains unknown or foreign interpolation holds and permits other expiry work',
    async (asset) => {
      const now = new Date('2026-09-24T10:00:00Z');
      mockDueReservations([
        {
          id: 'hold',
          organizationId: 'org_1',
          actorUserId: 'user_1',
          amount: 50,
          workloadType: 'interpolation',
          workloadId: 'asset',
        },
        { id: 'ordinary', organizationId: 'org_2', workloadType: 'generation' },
      ]);
      prisma.ingredient.findFirst.mockResolvedValue(asset);
      const settle = vi.spyOn(service, 'settle');
      const release = vi
        .spyOn(service, 'release')
        .mockResolvedValue({} as never);
      await expect(service.expireDue(now)).resolves.toBe(1);
      expect(release).toHaveBeenCalledExactlyOnceWith({
        organizationId: 'org_2',
        reason: 'expiry',
        reservationId: 'ordinary',
      });
      expect(settle).not.toHaveBeenCalled();
      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'hold',
          organizationId: 'org_1',
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
        },
        data: { expiresAt: new Date('2026-09-24T11:00:00Z') },
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Interpolation hold requires operator reconciliation',
        expect.objectContaining({ reservationId: 'hold' }),
      );
    },
  );

  it('settles a due live-session reservation at the reserved ceiling', async () => {
    const reserved = {
      actorUserId: 'user_1',
      amount: 24300,
      billingAccountId: 'ba_1',
      id: 'res_live',
      organizationId: 'org_1',
      status: CreditReservationStatus.RESERVED,
      workloadType: 'live-session',
    };
    mockDueReservations([reserved]);
    prisma.creditReservation.findFirst.mockResolvedValue(reserved);
    const settle = vi.spyOn(service, 'settle').mockResolvedValue({} as never);

    await expect(service.expireDue()).resolves.toBe(1);
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 24300,
        reservationId: 'res_live',
      }),
    );
    expect(prisma.liveSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settledCredits: 24300,
          status: 'TERMINATED',
          terminateReason: 'ceiling',
        }),
        where: expect.objectContaining({
          organizationId: 'org_1',
          reservationId: 'res_live',
        }),
      }),
    );
  });

  it('releases an expired reservation exactly once', async () => {
    const reserved = {
      amount: 20,
      billingAccountId: 'ba_1',
      id: 'res_1',
      organizationId: 'org_1',
      status: CreditReservationStatus.RESERVED,
    };
    mockDueReservations([reserved]);
    prisma.creditReservation.findFirst.mockResolvedValue(reserved);
    prisma.creditReservation.update.mockResolvedValue({
      ...reserved,
      status: CreditReservationStatus.EXPIRED,
    });

    await expect(service.expireDue()).resolves.toBe(1);
    expect(creditBalanceService.applyDelta).toHaveBeenCalledWith(
      'org_1',
      {
        billingAccountId: 'ba_1',
        heldDelta: -20,
      },
      txClient,
      'res_1',
    );
  });

  it('continues expiring later reservations when one tenant fails', async () => {
    mockDueReservations([
      { id: 'res_1', organizationId: 'org_1' },
      { id: 'res_2', organizationId: 'org_2' },
    ]);
    const release = vi
      .spyOn(service, 'release')
      .mockRejectedValueOnce(new Error('wallet unavailable'))
      .mockResolvedValueOnce({} as never);

    await expect(service.expireDue()).resolves.toBe(1);

    expect(release).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Credit reservation expiry failed',
      expect.any(Error),
      { organizationId: 'org_1', reservationId: 'res_1' },
    );
  });

  it.each([
    'media-generation',
    'media-generation-group',
    'workflow-generation',
  ])(
    'leaves %s holds to their evidence reconciler at expiry',
    async (workloadType) => {
      mockDueReservations([
        {
          id: 'media-hold',
          organizationId: 'org_1',
          workloadType,
        },
      ]);
      const release = vi.spyOn(service, 'release');
      await service.expireDue();
      expect(release).not.toHaveBeenCalled();
      expect(prisma.creditReservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { workloadType: null },
              {
                workloadType: {
                  notIn: [
                    'media-generation',
                    'media-generation-group',
                    'workflow-generation',
                  ],
                },
              },
            ],
          }),
        }),
      );
    },
  );

  describe('bindOutput', () => {
    const pool = (overrides: Record<string, unknown> = {}) => ({
      actorUserId: 'user_1',
      amount: 9,
      billingAccountId: 'ba_1',
      createdAt: new Date('2026-09-29T00:00:00Z'),
      description: 'Music generation',
      expiresAt: new Date('2026-09-29T02:00:00Z'),
      id: 'pool_1',
      idempotencyKey: 'generation:req_1',
      isDeleted: false,
      metadata: { marginMultiplier: 3.33 },
      organizationId: 'org_1',
      settledAmount: null,
      source: 'music-generation',
      status: CreditReservationStatus.RESERVED,
      updatedAt: new Date('2026-09-29T00:00:00Z'),
      workloadId: 'req_1',
      workloadType: 'generation',
      ...overrides,
    });
    const bindInput = {
      amount: 3,
      expiresAt: new Date('2026-09-29T02:00:00Z'),
      metadata: { assetId: 'ing_1' },
      organizationId: 'org_1',
      reservationId: 'pool_1',
      workloadId: 'ing_1',
    };

    it('moves one output share from the pool into its own hold without changing the wallet hold', async () => {
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pool());
      prisma.creditReservation.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          pool({ ...data, id: 'hold_1', metadata: data.metadata }),
      );

      const hold = await service.bindOutput(bindInput);

      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { amount: 6 } }),
      );
      expect(prisma.creditReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 3,
          description: 'Music generation',
          idempotencyKey: 'media-generation:ing_1',
          source: 'music-generation',
          workloadId: 'ing_1',
          workloadType: 'media-generation',
        }),
      });
      expect(hold.metadata).toEqual({
        assetId: 'ing_1',
        marginMultiplier: 3.33,
      });
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
    });

    it('retires float dust within tolerance onto the output hold', async () => {
      const dust = 1e-12;
      const poolAmount = 3 + dust;
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pool({ amount: poolAmount }));
      prisma.creditReservation.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          pool({ ...data, id: 'hold_1', metadata: data.metadata }),
      );

      const hold = await service.bindOutput(bindInput);

      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { amount: 0, status: CreditReservationStatus.RELEASED },
        }),
      );
      expect(prisma.creditReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: poolAmount }),
      });
      expect(hold.amount).toBe(poolAmount);
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
    });

    it('keeps a remainder above the bind tolerance reserved on the pool', async () => {
      const remainder = 1e-5;
      const poolAmount = 3 + remainder;
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pool({ amount: poolAmount }));
      prisma.creditReservation.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          pool({ ...data, id: 'hold_1', metadata: data.metadata }),
      );

      await service.bindOutput(bindInput);

      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { amount: poolAmount - 3 } }),
      );
      expect(prisma.creditReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 3 }),
      });
    });

    it('retires the pool when its last share is bound', async () => {
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pool({ amount: 3 }));
      prisma.creditReservation.create.mockResolvedValue(
        pool({ amount: 3, id: 'hold_1', workloadType: 'media-generation' }),
      );

      await service.bindOutput(bindInput);

      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { amount: 0, status: CreditReservationStatus.RELEASED },
        }),
      );
    });

    it('returns the existing hold when the same output is bound twice', async () => {
      prisma.creditReservation.findFirst.mockResolvedValueOnce(
        pool({ amount: 3, id: 'hold_1', workloadType: 'media-generation' }),
      );

      const hold = await service.bindOutput(bindInput);

      expect(hold.id).toBe('hold_1');
      expect(prisma.creditReservation.updateMany).not.toHaveBeenCalled();
      expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    });

    it('replays a simultaneous bind after a unique-key conflict without moving funds twice', async () => {
      transactionUtil.runInTransaction.mockRejectedValueOnce({ code: 'P2002' });
      prisma.creditReservation.findFirst.mockResolvedValue(
        pool({ amount: 3, id: 'hold_1', workloadType: 'media-generation' }),
      );
      await expect(service.bindOutput(bindInput)).resolves.toMatchObject({
        id: 'hold_1',
        amount: 3,
      });
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
    });

    it('rejects a share larger than what the pool has left', async () => {
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pool({ amount: 2 }));

      await expect(service.bindOutput(bindInput)).rejects.toMatchObject({
        errorCode: 'BIND_EXCEEDS_RESERVATION',
      });
      expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    });

    it('refuses to bind from a pool that is no longer reserved', async () => {
      prisma.creditReservation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          pool({ status: CreditReservationStatus.RELEASED }),
        );

      await expect(service.bindOutput(bindInput)).rejects.toThrow();
      expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    });
  });
});
