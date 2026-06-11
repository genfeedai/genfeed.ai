import type { CreditBalanceDocument } from '@api/collections/credits/schemas/credit-balance.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
      where: {
        isDeleted: false,
        organizationId,
      },
    });
  }

  @HandleErrors('get or create balance', 'credits')
  async getOrCreateBalance(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    if (!organizationId) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const balance = await this.findByOrganization(organizationId, tx);

    if (!balance) {
      return this.create({ balance: 0, isDeleted: false, organizationId }, tx);
    }

    return balance;
  }

  @HandleErrors('update balance', 'credits')
  async updateBalance(
    organizationId: string,
    newBalance: number,
    tx?: PrismaTransactionClient,
  ): Promise<CreditBalanceDocument> {
    const balance = await this.getOrCreateBalance(organizationId, tx);

    return (tx ?? this.prisma).creditBalance.update({
      data: { balance: newBalance },
      where: { id: balance.id },
    });
  }

  @HandleErrors('delete credit balance', 'credits')
  async delete(id: string): Promise<void> {
    await this.prisma.creditBalance.update({
      data: { isDeleted: true },
      where: { id },
    });
  }
}
