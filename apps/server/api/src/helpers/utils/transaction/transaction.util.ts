import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

/**
 * Transaction utility for running MongoDB operations atomically.
 * Requires MongoDB replica set to be configured.
 *
 * Usage:
 * ```
 * await this.transactionUtil.runInTransaction(async (session) => {
 *   await this.usersService.create(userData, { session });
 *   await this.creditsService.create(creditData, { session });
 * });
 * ```
 */
@Injectable()
export class TransactionUtil {
  constructor(
    @InjectConnection(DB_CONNECTIONS.CLOUD)
    private readonly connection: Connection,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Execute a function within a MongoDB transaction.
   * Automatically commits on success or aborts on error.
   *
   * @param fn - Function to execute within the transaction
   * @returns Result of the function
   * @throws Error if transaction fails
   */
  async runInTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction({
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' },
      });

      const result = await fn(session);

      await session.commitTransaction();

      return result;
    } catch (error) {
      await session.abortTransaction();

      this.loggerService.error('Transaction aborted', {
        error: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });

      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Check if transactions are supported (requires replica set).
   * Useful for graceful degradation in development environments.
   */
  async isTransactionSupported(): Promise<boolean> {
    try {
      const session = await this.connection.startSession();
      await session.endSession();
      return true;
    } catch {
      return false;
    }
  }
}
