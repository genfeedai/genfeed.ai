import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import {
  BillingAccountResolutionError,
  OrganizationBillingAccountService,
} from '@api/services/integrations/stripe/services/organization-billing-account.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OrganizationBillingAccountService', () => {
  let service: OrganizationBillingAccountService;
  const customers = {
    findByOrganizationId: vi.fn(),
    provisionForOrganization: vi.fn(),
  };
  const stripe = {
    createBillingAccountCustomer: vi.fn(),
    findBillingAccountCustomers: vi.fn(),
    retrieveCustomer: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const billingAccounts = {
      attachStripeCustomer: vi.fn().mockResolvedValue(undefined),
      resolveForOrganization: vi.fn().mockResolvedValue({
        id: 'ba_1',
        stripeCustomerId: null,
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationBillingAccountService,
        { provide: BillingAccountsService, useValue: billingAccounts },
        { provide: CustomersService, useValue: customers },
        { provide: StripeService, useValue: stripe },
        {
          provide: LoggerService,
          useValue: { warn: vi.fn() },
        },
      ],
    }).compile();
    service = module.get(OrganizationBillingAccountService);
  });

  it('returns a verified canonical organization customer', async () => {
    customers.findByOrganizationId.mockResolvedValue({
      id: 'row_1',
      stripeCustomerId: 'cus_1',
    });
    stripe.retrieveCustomer.mockResolvedValue({
      id: 'cus_1',
      metadata: {
        billing_account_id: 'ba_1',
        billing_account_type: 'billing_account',
      },
    });

    await expect(
      service.resolveExisting('org_1', { stripeCustomerId: 'cus_1' }),
    ).resolves.toEqual({ customerId: 'row_1', stripeCustomerId: 'cus_1' });
  });

  it('blocks conflicting persisted and projected customer identities', async () => {
    customers.findByOrganizationId.mockResolvedValue({
      id: 'row_1',
      stripeCustomerId: 'cus_canonical',
    });

    const error = await service
      .resolveExisting('org_1', { stripeCustomerId: 'cus_legacy' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BillingAccountResolutionError);
    expect((error as BillingAccountResolutionError).code).toBe(
      'billing_customer_conflict',
    );
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('retries a transient provider lookup exactly once', async () => {
    customers.findByOrganizationId.mockResolvedValue({
      id: 'row_1',
      stripeCustomerId: 'cus_1',
    });
    stripe.retrieveCustomer
      .mockRejectedValueOnce({ code: 'api_connection_error' })
      .mockResolvedValueOnce({
        id: 'cus_1',
        metadata: {
          billing_account_id: 'ba_1',
          billing_account_type: 'billing_account',
        },
      });

    await expect(
      service.resolveExisting('org_1', { stripeCustomerId: 'cus_1' }),
    ).resolves.toEqual({ customerId: 'row_1', stripeCustomerId: 'cus_1' });
    expect(stripe.retrieveCustomer).toHaveBeenCalledTimes(2);
  });

  it('blocks automatic recreation when another active Stripe identity exists', async () => {
    customers.provisionForOrganization.mockImplementation(
      async (
        _organizationId: string,
        provision: (id: null) => Promise<string>,
      ) => await provision(null),
    );
    stripe.findBillingAccountCustomers.mockResolvedValue([
      { id: 'cus_active' },
    ]);

    await expect(
      service.resolveOrProvision({
        billingAccountId: 'ba_1',
        billingEmail: 'billing@example.com',
        organizationId: 'org_1',
        organizationLabel: 'Example',
        userId: 'user_1',
      }),
    ).rejects.toMatchObject({ code: 'billing_customer_conflict' });
    expect(stripe.createBillingAccountCustomer).not.toHaveBeenCalled();
  });

  it('repairs a missing identity through the locked idempotent provision path', async () => {
    customers.provisionForOrganization.mockImplementation(
      async (
        _organizationId: string,
        provision: (id: null) => Promise<string>,
      ) => ({
        id: 'row_1',
        stripeCustomerId: await provision(null),
      }),
    );
    stripe.findBillingAccountCustomers.mockResolvedValue([]);
    stripe.createBillingAccountCustomer.mockResolvedValue({ id: 'cus_new' });

    await expect(
      service.resolveOrProvision({
        billingAccountId: 'ba_1',
        billingEmail: 'billing@example.com',
        organizationId: 'org_1',
        organizationLabel: 'Example',
        userId: 'user_1',
      }),
    ).resolves.toEqual({ customerId: 'row_1', stripeCustomerId: 'cus_new' });
  });
});
