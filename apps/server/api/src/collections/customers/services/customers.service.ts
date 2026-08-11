import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';
import type {
  Customer,
  CustomerDocument,
} from '@api/collections/customers/schemas/customer.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomersService extends BaseService<
  CustomerDocument,
  CreateCustomerDto,
  UpdateCustomerDto,
  Prisma.CustomerWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'customer', logger);
  }

  findByOrganizationId(organizationId: string): Promise<Customer | null> {
    return this.delegate.findFirst({
      where: scopedWhere(organizationId, {}),
    }) as Promise<Customer | null>;
  }

  findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.delegate.findFirst({
      where: {
        isDeleted: false,
        stripeCustomerId,
      },
    }) as Promise<Customer | null>;
  }

  /**
   * Bind a Stripe customer id to the organization's single active customer
   * row. An organization owns exactly one billing identity — enforced by the
   * partial unique index `customers_organizationId_active_key` — so every
   * writer must converge on this row instead of inserting a second one.
   * Concurrent first-checkout races surface as P2002; the loser re-reads the
   * winner's row and patches it.
   */
  async upsertForOrganization(
    organizationId: string,
    stripeCustomerId: string,
  ): Promise<Customer> {
    const existing = await this.findByOrganizationId(organizationId);

    if (existing) {
      if (existing.stripeCustomerId === stripeCustomerId) {
        return existing;
      }

      return await this.patch(String(existing.id), { stripeCustomerId });
    }

    try {
      return await this.create({ organizationId, stripeCustomerId });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findByOrganizationId(organizationId);
        if (winner) {
          return await this.patch(String(winner.id), { stripeCustomerId });
        }
      }

      throw error;
    }
  }
}
