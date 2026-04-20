import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionUtil } from './transaction.util';

const mockPrismaService = {
  $transaction: vi.fn(),
};

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

describe('TransactionUtil', () => {
  let transactionUtil: TransactionUtil;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionUtil,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    transactionUtil = new TransactionUtil(
      mockPrismaService as never,
      mockLoggerService as never,
    );
  });

  it('should be defined', () => {
    expect(transactionUtil).toBeDefined();
  });

  it('runs the function in a Prisma transaction and returns result', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    mockPrismaService.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await transactionUtil.runInTransaction(fn);

    expect(mockPrismaService.$transaction).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('logs error and re-throws when transaction fails', async () => {
    const error = new Error('db failure');
    mockPrismaService.$transaction.mockRejectedValue(error);

    await expect(transactionUtil.runInTransaction(vi.fn())).rejects.toThrow(
      'db failure',
    );

    expect(mockLoggerService.error).toHaveBeenCalledWith(
      'Transaction aborted',
      expect.objectContaining({ error: 'db failure' }),
    );
  });

  describe('isTransactionSupported', () => {
    it('returns true when transaction can be started', async () => {
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      const supported = await transactionUtil.isTransactionSupported();

      expect(supported).toBe(true);
    });

    it('returns false when $transaction throws', async () => {
      mockPrismaService.$transaction.mockRejectedValue(
        new Error('no transaction support'),
      );

      const supported = await transactionUtil.isTransactionSupported();

      expect(supported).toBe(false);
    });
  });
});
