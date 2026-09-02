import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import { BILLING_ACCOUNT_METADATA } from '@api/services/integrations/stripe/services/billing-account-metadata.constant';
import {
  type StripeCustomer,
  StripeService,
} from '@api/services/integrations/stripe/services/stripe.service';
import {
  classifyStripeFailure,
  type StripeFailureCategory,
} from '@api/services/integrations/stripe/services/stripe-error.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type BillingAccountResolutionCode =
  | 'billing_customer_conflict'
  | 'billing_customer_missing'
  | 'billing_customer_unverified'
  | 'billing_provider_unavailable';

export class BillingAccountResolutionError extends Error {
  constructor(
    public readonly code: BillingAccountResolutionCode,
    public readonly category: StripeFailureCategory | 'identity_conflict',
  ) {
    super('Organization billing account could not be resolved');
    this.name = 'BillingAccountResolutionError';
  }
}

type BillingAccountProjection = {
  stripeCustomerId?: string | null;
};

type BillingAccountProvisionInput = BillingAccountProjection & {
  billingAccountId: string;
  billingEmail: string;
  organizationId: string;
  organizationLabel: string;
  userId: string;
};

@Injectable()
export class OrganizationBillingAccountService {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly customersService: CustomersService,
    private readonly stripeService: StripeService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolveExisting(
    organizationId: string,
    projection: BillingAccountProjection,
  ): Promise<{ customerId: string; stripeCustomerId: string }> {
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    const customer =
      await this.customersService.findByOrganizationId(organizationId);
    const persistedId = customer?.stripeCustomerId ?? null;
    this.assertProjectionMatches(
      account.stripeCustomerId ?? null,
      projection.stripeCustomerId,
    );
    this.assertProjectionMatches(persistedId, account.stripeCustomerId);
    this.assertProjectionMatches(persistedId, projection.stripeCustomerId);

    const stripeCustomerId =
      account.stripeCustomerId ?? persistedId ?? projection.stripeCustomerId;
    if (!stripeCustomerId) {
      throw this.failure('billing_customer_missing', 'customer_missing');
    }

    const stripeCustomer = await this.retrieve(stripeCustomerId);
    if (!stripeCustomer) {
      throw this.failure('billing_customer_missing', 'customer_missing');
    }
    this.assertOwnedByBillingAccount(stripeCustomer, account.id);

    if (!customer?.id) {
      throw this.failure('billing_customer_unverified', 'identity_conflict');
    }

    return { customerId: String(customer.id), stripeCustomerId };
  }

  async resolveOrProvision(
    input: BillingAccountProvisionInput,
  ): Promise<{ customerId: string; stripeCustomerId: string }> {
    const account = await this.billingAccountsService.resolveForOrganization(
      input.organizationId,
    );
    if (account.id !== input.billingAccountId) {
      throw this.failure('billing_customer_conflict', 'identity_conflict');
    }
    this.assertProjectionMatches(
      account.stripeCustomerId ?? null,
      input.stripeCustomerId,
    );
    const customer = await this.customersService.provisionForOrganization(
      input.organizationId,
      async (persistedId) => {
        this.assertProjectionMatches(
          persistedId,
          account.stripeCustomerId ?? null,
        );
        this.assertProjectionMatches(persistedId, input.stripeCustomerId);
        const candidateId =
          account.stripeCustomerId ??
          persistedId ??
          input.stripeCustomerId ??
          null;
        if (candidateId) {
          const existing = await this.retrieve(candidateId);
          if (existing) {
            this.assertOwnedByBillingAccount(existing, account.id);
            return existing.id;
          }
        }

        const matches = await this.stripeService.findBillingAccountCustomers(
          account.id,
        );
        if (matches.length > 0) {
          throw this.failure('billing_customer_conflict', 'identity_conflict');
        }

        const created = await this.stripeService.createBillingAccountCustomer(
          input.organizationLabel,
          input.billingEmail,
          account.id,
          input.organizationId,
          input.userId,
          candidateId,
        );
        return created.id;
      },
    );

    if (!customer.stripeCustomerId) {
      throw this.failure('billing_customer_missing', 'customer_missing');
    }

    await this.billingAccountsService.attachStripeCustomer(
      account.id,
      customer.stripeCustomerId,
    );

    return {
      customerId: String(customer.id),
      stripeCustomerId: customer.stripeCustomerId,
    };
  }

  async resolveWebhookOrganization(
    stripeCustomerId: string,
    metadata: Record<string, string> | null | undefined,
  ): Promise<string> {
    const organizationId = metadata?.[BILLING_ACCOUNT_METADATA.organizationId];
    const billingAccountId =
      metadata?.[BILLING_ACCOUNT_METADATA.billingAccountId];
    if (
      metadata?.[BILLING_ACCOUNT_METADATA.type] !== 'billing_account' ||
      !organizationId ||
      !billingAccountId
    ) {
      throw this.failure('billing_customer_unverified', 'identity_conflict');
    }

    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    if (account.id !== billingAccountId) {
      throw this.failure('billing_customer_unverified', 'identity_conflict');
    }
    await this.resolveExisting(organizationId, { stripeCustomerId });
    return organizationId;
  }

  private assertProjectionMatches(
    persistedId: string | null,
    projectedId: string | null | undefined,
  ): void {
    if (persistedId && projectedId && persistedId !== projectedId) {
      throw this.failure('billing_customer_conflict', 'identity_conflict');
    }
  }

  private assertOwnedByBillingAccount(
    customer: StripeCustomer,
    billingAccountId: string,
  ): void {
    if (
      customer.metadata?.[BILLING_ACCOUNT_METADATA.type] !==
        'billing_account' ||
      customer.metadata?.[BILLING_ACCOUNT_METADATA.billingAccountId] !==
        billingAccountId
    ) {
      throw this.failure('billing_customer_unverified', 'identity_conflict');
    }
  }

  private async retrieve(customerId: string): Promise<StripeCustomer | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.stripeService.retrieveCustomer(customerId);
      } catch (error: unknown) {
        const category = classifyStripeFailure(error);
        if (category === 'provider_unavailable' && attempt === 0) {
          continue;
        }
        throw this.failure('billing_provider_unavailable', category);
      }
    }

    throw this.failure('billing_provider_unavailable', 'provider_unavailable');
  }

  private failure(
    code: BillingAccountResolutionCode,
    category: StripeFailureCategory | 'identity_conflict',
  ): BillingAccountResolutionError {
    this.loggerService.warn('Organization billing identity resolution failed', {
      category,
      code,
    });
    return new BillingAccountResolutionError(code, category);
  }
}
