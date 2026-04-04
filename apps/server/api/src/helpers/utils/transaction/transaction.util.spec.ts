import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionUtil } from './transaction.util';

const mockSession = {
  abortTransaction: vi.fn().mockResolvedValue(undefined),
  commitTransaction: vi.fn().mockResolvedValue(undefined),
  endSession: vi.fn().mockResolvedValue(undefined),
  startTransaction: vi.fn(),
};

const mockConnection = {
  startSession: vi.fn().mockResolvedValue(mockSession),
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
          provide: getConnectionToken(DB_CONNECTIONS.CLOUD),
          useValue: mockConnection,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    // Manually instantiate since LoggerService token may vary
    transactionUtil = new TransactionUtil(
      mockConnection as never,
      mockLoggerService as never,
    );
  });

  it('should be defined', () => {
    expect(transactionUtil).toBeDefined();
  });

  it('starts a session and transaction, commits on success', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    const result = await transactionUtil.runInTransaction(fn);

    expect(mockConnection.startSession).toHaveBeenCalledOnce();
    expect(mockSession.startTransaction).toHaveBeenCalledWith({
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
    });
    expect(fn).toHaveBeenCalledWith(mockSession);
    expect(mockSession.commitTransaction).toHaveBeenCalledOnce();
    expect(mockSession.endSession).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('aborts the transaction and re-throws on error', async () => {
    const error = new Error('db failure');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(transactionUtil.runInTransaction(fn)).rejects.toThrow(
      'db failure',
    );

    expect(mockSession.abortTransaction).toHaveBeenCalledOnce();
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledOnce();
  });

  it('logs error when transaction is aborted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('tx error'));

    await expect(transactionUtil.runInTransaction(fn)).rejects.toThrow();

    expect(mockLoggerService.error).toHaveBeenCalledWith(
      'Transaction aborted',
      expect.objectContaining({ error: 'tx error' }),
    );
  });

  it('ensures endSession is always called even when commit fails', async () => {
    mockSession.commitTransaction.mockRejectedValueOnce(
      new Error('commit failed'),
    );
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(transactionUtil.runInTransaction(fn)).rejects.toThrow(
      'commit failed',
    );

    expect(mockSession.endSession).toHaveBeenCalledOnce();
  });

  describe('isTransactionSupported', () => {
    it('returns true when a session can be started', async () => {
      const supported = await transactionUtil.isTransactionSupported();
      expect(supported).toBe(true);
    });

    it('returns false when startSession throws', async () => {
      mockConnection.startSession.mockRejectedValueOnce(
        new Error('no replica set'),
      );
      const supported = await transactionUtil.isTransactionSupported();
      expect(supported).toBe(false);
    });
  });
});
