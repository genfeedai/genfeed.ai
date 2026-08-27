import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

describe('CreditReservationService', () => {
  const prisma = {
    creditReservation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    creditTransaction: { updateMany: vi.fn() },
  };
  const logger = { log: vi.fn() };
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
    vi.clearAllMocks();
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
        reservationId: 'res_1',
      }),
    ).rejects.toBeInstanceOf(BusinessLogicException);
    expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
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
});
