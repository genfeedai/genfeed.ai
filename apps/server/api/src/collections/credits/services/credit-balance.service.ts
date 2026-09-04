import type { CreditBalanceDocument } from '@api/collections/credits/schemas/credit-balance.schema';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IApplyCreditDeltaInput,
  ICreditWalletSnapshot,
} from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CreditBalanceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create credit balance', 'credits')
  async create(
    data: {
      balance: number;
      isDeleted: boolean;
      organizationId: string;
      billingAccountId?: string | null;
      heldAmount?: number;
      version?: number;
    },
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    return (tx ?? this.prisma).creditBalance.create({ data });
  }

  @HandleErrors('find by organization', 'credits')
  async findByOrganization(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument | null> {
    if (!organizationId) {
      this.logger.warn(`${this.constructorName} findByOrganization failed`, {
        organizationId,
      });
      return null;
    }

    return (tx ?? this.prisma).creditBalance.findFirst({
      where: scopedWhere(organizationId, {}),
    });
  }

  @HandleErrors('get or create balance', 'credits')
  async getOrCreateBalance(
    organizationId: string,
    tx?: PrismaTransactionClient,
    billingAccountId?: string | null,
  ): Promise<CreditBalanceDocument> {
    if (!organizationId) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const client = tx ?? this.prisma;
    if (billingAccountId) {
      const shared = await client.creditBalance.findFirst({
        where: scopedWhere(organizationId, { billingAccountId }),
      });
      if (shared) {
        return shared;
      }
    }

    const balance = await this.findByOrganization(organizationId, tx);

    if (!balance) {
      return this.create(
        {
          balance: 0,
          billingAccountId: billingAccountId ?? undefined,
          heldAmount: 0,
          isDeleted: false,
          organizationId,
          version: 0,
        },
        tx,
      );
    }

    if (billingAccountId && !balance.billingAccountId) {
      return client.creditBalance.update({
        data: { billingAccountId },
        where: scopedWhere(organizationId, { id: balance.id }),
      });
    }

    return balance;
  }

  toSnapshot(balance: CreditBalanceDocument): ICreditWalletSnapshot {
    const settled = typeof balance.balance === 'number' ? balance.balance : 0;
    const held =
      typeof balance.heldAmount === 'number' ? balance.heldAmount : 0;
    return {
      available: settled - held,
      billingAccountId: balance.billingAccountId ?? null,
      held,
      id: balance.id,
      organizationId: balance.organizationId ?? '',
      settled,
      version: balance.version ?? 0,
    };
  }

  /**
   * Conditional balance mutation. Rejects the write when it would make
   * available credits (settled - held) drop below `-maxOverdraftCredits`,
   * or when it would make held amount negative.
   */
  async applyDelta(
    organizationId: string,
    input: IApplyCreditDeltaInput,
    tx?: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    const balanceDelta = input.balanceDelta ?? 0;
    const heldDelta = input.heldDelta ?? 0;
    const maxOverdraftCredits = Math.max(0, input.maxOverdraftCredits ?? 0);
    const balance = await this.getOrCreateBalance(
      organizationId,
      tx,
      input.billingAccountId,
    );
    const client = tx ?? this.prisma;
    const updated = await client.$executeRaw(
      Prisma.sql`
        UPDATE "credit_balances"
        SET
          "balance" = "balance" + ${balanceDelta},
          "heldAmount" = "heldAmount" + ${heldDelta},
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${balance.id}
          AND "organizationId" = ${organizationId}
          AND "isDeleted" = false
          AND "heldAmount" + ${heldDelta} >= 0
          AND ("balance" + ${balanceDelta}) - ("heldAmount" + ${heldDelta}) >= ${-maxOverdraftCredits}
      `,
    );

    if (updated !== 1) {
      throw new BusinessLogicException(
        `Insufficient organization credits. Available: ${this.toSnapshot(balance).available}, Required: ${Math.max(0, -balanceDelta) + Math.max(0, heldDelta)}, Max overdraft: ${maxOverdraftCredits}`,
        {
          available: this.toSnapshot(balance).available,
          balanceDelta,
          heldDelta,
          maxOverdraftCredits,
          organizationId,
        },
        'INSUFFICIENT_CREDITS',
      );
    }

    const next = await client.creditBalance.findFirst({
      where: scopedWhere(organizationId, { id: balance.id }),
    });
    if (!next) {
      throw new BusinessLogicException(
        'Credit balance disappeared during mutation',
      );
    }

    return this.toSnapshot(next);
  }

  @HandleErrors('update balance', 'credits')
  async updateBalance(
    organizationId: string,
    newBalance: number,
    billingAccountId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    const current = await this.getOrCreateBalance(
      organizationId,
      tx,
      billingAccountId,
    );
    const snapshot = await this.applyDelta(
      organizationId,
      {
        balanceDelta: newBalance - (current.balance ?? 0),
        billingAccountId,
      },
      tx,
    );
    const next = await (tx ?? this.prisma).creditBalance.findFirst({
      where: scopedWhere(organizationId, { id: snapshot.id }),
    });
    if (!next) {
      throw new BusinessLogicException(
        'Credit balance disappeared during mutation',
      );
    }
    return next;
  }

  @HandleErrors('delete credit balance', 'credits')
  async delete(id: string): Promise<void> {
    await this.prisma.creditBalance.update({
      data: { isDeleted: true },
      where: { id },
    });
  }
}
