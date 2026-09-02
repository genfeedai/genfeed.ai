import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';
import type {
  Customer,
  CustomerDocument,
} from '@api/collections/customers/schemas/customer.schema';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const ORGANIZATION_BILLING_LOCK_TTL_SECONDS = 30;
const ORGANIZATION_BILLING_LOCK_RETRY_DELAYS_MS = [
  50, 100, 200, 300, 400, 500, 500,
];

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
    private readonly organizationBillingCacheService: CacheService,
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
   * Serialize Stripe customer provisioning for an organization, then re-read
   * its authoritative customer row inside the lock. This prevents two members
   * starting checkout together from both observing "no customer" and minting
   * separate Stripe identities.
   *
   * The bounded fallback keeps billing available during a Redis outage. Stripe
   * creation remains duplicate-safe because the caller also uses an
   * organization-and-generation-scoped idempotency key.
   */
  async provisionForOrganization(
    organizationId: string,
    provisionStripeCustomer: (
      currentStripeCustomerId: string | null,
    ) => Promise<string>,
  ): Promise<Customer> {
    const lockKey = this.organizationBillingCacheService.generateKey(
      'organization-billing',
      'customer-provision',
      organizationId,
    );
    const provision = async (): Promise<Customer> => {
      const current = await this.findByOrganizationId(organizationId);
      const stripeCustomerId = await provisionStripeCustomer(
        current?.stripeCustomerId ?? null,
      );

      return await this.upsertForOrganization(organizationId, stripeCustomerId);
    };

    let provisioned = await this.organizationBillingCacheService.withLock(
      lockKey,
      provision,
      ORGANIZATION_BILLING_LOCK_TTL_SECONDS,
    );
    if (provisioned) {
      return provisioned;
    }

    for (const delayMs of ORGANIZATION_BILLING_LOCK_RETRY_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      provisioned = await this.organizationBillingCacheService.withLock(
        lockKey,
        provision,
        ORGANIZATION_BILLING_LOCK_TTL_SECONDS,
      );
      if (provisioned) {
        return provisioned;
      }
    }

    this.logger.warn(
      'Organization billing lock unavailable; using idempotent fallback',
      { organizationId },
    );
    return await provision();
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
