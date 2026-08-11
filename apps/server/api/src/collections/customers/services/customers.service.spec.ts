import { CustomersService } from '@api/collections/customers/services/customers.service';
import { Prisma } from '@genfeedai/prisma';

describe('CustomersService.upsertForOrganization', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  function makeService() {
    const customer = {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    };
    let locked = false;
    const cacheService = {
      generateKey: vi.fn(
        (namespace: string, ...parts: string[]) =>
          `${namespace}:${parts.join(':')}`,
      ),
      withLock: vi.fn(
        async (_key: string, callback: () => Promise<unknown>) => {
          if (locked) {
            return null;
          }
          locked = true;
          try {
            return await callback();
          } finally {
            locked = false;
          }
        },
      ),
    };
    return {
      cacheService,
      customer,
      service: new CustomersService(
        { customer } as never,
        logger as never,
        cacheService as never,
      ),
    };
  }

  function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`organizationId`)',
      { clientVersion: 'test', code: 'P2002' },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing row untouched when it already carries the Stripe id', async () => {
    const { customer, service } = makeService();
    customer.findFirst.mockResolvedValue({
      id: 'cust_row_1',
      stripeCustomerId: 'cus_1',
    });

    const result = await service.upsertForOrganization('org_1', 'cus_1');

    expect(result.id).toBe('cust_row_1');
    expect(customer.create).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('rebinds the existing row when the Stripe id changed', async () => {
    const { customer, service } = makeService();
    customer.findFirst.mockResolvedValue({
      id: 'cust_row_1',
      stripeCustomerId: 'cus_stale',
    });
    customer.update.mockResolvedValue({
      id: 'cust_row_1',
      stripeCustomerId: 'cus_fresh',
    });

    const result = await service.upsertForOrganization('org_1', 'cus_fresh');

    expect(customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeCustomerId: 'cus_fresh' }),
        where: { id: 'cust_row_1' },
      }),
    );
    expect(result.stripeCustomerId).toBe('cus_fresh');
    expect(customer.create).not.toHaveBeenCalled();
  });

  it('creates the single org row when none exists', async () => {
    const { customer, service } = makeService();
    customer.findFirst.mockResolvedValue(null);
    customer.create.mockResolvedValue({
      id: 'cust_row_new',
      stripeCustomerId: 'cus_new',
    });

    const result = await service.upsertForOrganization('org_1', 'cus_new');

    expect(customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org_1',
          stripeCustomerId: 'cus_new',
        }),
      }),
    );
    expect(result.id).toBe('cust_row_new');
  });

  it('converges on the winning row when a concurrent insert wins the race', async () => {
    // Partial unique index `customers_organizationId_active_key`: the losing
    // insert re-reads the winner's row and patches it instead of failing.
    const { customer, service } = makeService();
    customer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'cust_row_winner',
      stripeCustomerId: 'cus_winner',
    });
    customer.create.mockRejectedValue(uniqueViolation());
    customer.update.mockResolvedValue({
      id: 'cust_row_winner',
      stripeCustomerId: 'cus_loser',
    });

    const result = await service.upsertForOrganization('org_1', 'cus_loser');

    expect(customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeCustomerId: 'cus_loser' }),
        where: { id: 'cust_row_winner' },
      }),
    );
    expect(result.id).toBe('cust_row_winner');
  });

  it('rethrows non-unique-violation insert failures', async () => {
    const { customer, service } = makeService();
    customer.findFirst.mockResolvedValue(null);
    customer.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.upsertForOrganization('org_1', 'cus_new'),
    ).rejects.toThrow('db down');
  });

  it('serializes concurrent provisioning and reuses the winning Stripe customer', async () => {
    const { customer, service } = makeService();
    let persistedCustomer: {
      id: string;
      organizationId: string;
      stripeCustomerId: string;
    } | null = null;
    customer.findFirst.mockImplementation(async () => persistedCustomer);
    customer.create.mockImplementation(
      async ({
        data,
      }: {
        data: { organizationId: string; stripeCustomerId: string };
      }) => {
        persistedCustomer = { id: 'cust_row_1', ...data };
        return persistedCustomer;
      },
    );
    const createStripeCustomer = vi.fn(async (billingEmail: string) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return billingEmail === 'first@acme.test' ? 'cus_first' : 'cus_second';
    });

    const [first, second] = await Promise.all([
      service.provisionForOrganization(
        'org_1',
        async (current) =>
          current ?? (await createStripeCustomer('first@acme.test')),
      ),
      service.provisionForOrganization(
        'org_1',
        async (current) =>
          current ?? (await createStripeCustomer('second@acme.test')),
      ),
    ]);

    expect(createStripeCustomer).toHaveBeenCalledTimes(1);
    expect(first.stripeCustomerId).toBe('cus_first');
    expect(second.stripeCustomerId).toBe('cus_first');
    expect(customer.create).toHaveBeenCalledTimes(1);
  });
});
