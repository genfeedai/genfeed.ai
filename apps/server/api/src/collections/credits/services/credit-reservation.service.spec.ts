import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';

describe('CreditReservationService', () => {
  const prisma = {
    creditReservation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditTransaction: { updateMany: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn() };
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

  beforeEach(() => {
    prisma.creditReservation.create.mockReset();
    prisma.creditReservation.findFirst.mockReset();
    prisma.creditReservation.findMany.mockReset();
    prisma.creditReservation.update.mockReset();
    prisma.creditReservation.updateMany
      .mockReset()
      .mockResolvedValue({ count: 1 });
    prisma.creditTransaction.updateMany.mockReset();
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

  it('releases an expired reservation exactly once', async () => {
    const reserved = {
      amount: 20,
      billingAccountId: 'ba_1',
      id: 'res_1',
      organizationId: 'org_1',
      status: CreditReservationStatus.RESERVED,
    };
    prisma.creditReservation.findMany.mockResolvedValue([reserved]);
    prisma.creditReservation.findFirst.mockResolvedValue(reserved);
    prisma.creditReservation.update.mockResolvedValue({
      ...reserved,
      status: CreditReservationStatus.EXPIRED,
    });

    await expect(service.expireDue()).resolves.toBe(1);
    expect(creditBalanceService.applyDelta).toHaveBeenCalledWith(
      'org_1',
      { billingAccountId: 'ba_1', heldDelta: -20 },
      txClient,
    );
  });

  it('continues expiring later reservations when one tenant fails', async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
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
});
