import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PrismaTransactionClient = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Transaction utility for running database operations atomically.
 *
 * Usage:
 * ```
 * await this.transactionUtil.runInTransaction(async (tx) => {
 *   await this.usersService.create(userData, tx);
 *   await this.creditsService.create(creditData, tx);
 * });
 * ```
 */
@Injectable()
export class TransactionUtil {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Execute a function within a Prisma transaction.
   * Automatically commits on success or rolls back on error.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Optional Prisma transaction options
   * @returns Result of the function
   * @throws Error if transaction fails
   */
  async runInTransaction<T>(
    fn: (tx: PrismaTransactionClient) => Promise<T>,
    options?: Prisma.TransactionOptions,
  ): Promise<T> {
    try {
      return await this.prismaService.$transaction(
        (tx) => fn(tx as PrismaTransactionClient),
        options,
      );
    } catch (error) {
      this.loggerService.error('Transaction aborted', {
        error: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });

      throw error;
    }
  }

  /**
   * Check if transactions are supported.
   * Always returns true for Prisma (supported in all environments).
   */
  async isTransactionSupported(): Promise<boolean> {
    try {
      await this.prismaService.$transaction(async () => {
        // no-op to test transaction support
      });
      return true;
    } catch {
      return false;
    }
  }
}
