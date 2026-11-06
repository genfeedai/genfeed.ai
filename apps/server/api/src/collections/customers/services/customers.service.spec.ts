import { CustomersService } from '@api/collections/customers/services/customers.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

interface CustomerRow {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  stripeCustomerId: string;
}

type Where = Record<string, unknown>;

const matches = (row: CustomerRow, where: Where) =>
  Object.entries(where).every(
    ([key, value]) => row[key as keyof CustomerRow] === value,
  );

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`organizationId`)',
    { clientVersion: 'test', code: 'P2002' },
  );
}

/**
 * In-memory customers table that enforces the partial unique index
 * `customers_organizationId_active_key` (one active row per organization) and
 * runs every query through the CLOUD tenant guard. `beforeCreate` lets a test
 * commit a concurrent writer's insert just before this one lands.
 */
function setup(rows: CustomerRow[] = []) {
  const hooks = {
    beforeCreate: (): void => undefined,
    failCreate: undefined as Error | undefined,
  };
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'Customer',
      operation,
      tenantModelNames: new Set(['Customer']),
    });
  const insert = (data: Omit<CustomerRow, 'id' | 'isDeleted'>) => {
    if (
      rows.some(
        (row) => !row.isDeleted && row.organizationId === data.organizationId,
      )
    ) {
      throw uniqueViolation();
    }
    const row = {
      id: `cust_row_${rows.length + 1}`,
      isDeleted: false,
      ...data,
    };
    rows.push(row);
    return row;
  };
  const customer = {
    create: async (args: { data: Omit<CustomerRow, 'id' | 'isDeleted'> }) => {
      guard('create', args);
      if (hooks.failCreate) throw hooks.failCreate;
      hooks.beforeCreate();
      return { ...insert(args.data) };
    },
    findFirst: async (args: { where: Where }) => {
      guard('findFirst', args);
      const row = rows.find((item) => matches(item, args.where));
      return row ? { ...row } : null;
    },
    update: async (args: { data: Partial<CustomerRow>; where: Where }) => {
      guard('update', args);
      const row = rows.find((item) => matches(item, args.where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, args.data);
      return { ...row };
    },
  };
  let isLocked = false;
  const cacheService = {
    generateKey: (namespace: string, ...parts: string[]) =>
      `${namespace}:${parts.join(':')}`,
    withLock: async <T>(_key: string, work: () => Promise<T>) => {
      if (isLocked) return null;
      isLocked = true;
      try {
        return await work();
      } finally {
        isLocked = false;
      }
    },
  } as unknown as CacheService;
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;
  const service = new CustomersService(
    { customer } as unknown as PrismaService,
    logger,
    cacheService,
  );
  const inTenant = <T>(work: () => Promise<T>) =>
    runWithTenantContext({ organizationId: 'org_1' }, work);
  return { hooks, inTenant, insert, rows, service };
}

const row = (overrides: Partial<CustomerRow> = {}): CustomerRow => ({
  id: 'cust_row_1',
  isDeleted: false,
  organizationId: 'org_1',
  stripeCustomerId: 'cus_1',
  ...overrides,
});

describe('CustomersService.upsertForOrganization', () => {
  it('returns the existing row untouched when it already carries the Stripe id', async () => {
    const existing = row();
    const { inTenant, rows, service } = setup([existing]);

    const result = await inTenant(() =>
      service.upsertForOrganization('org_1', 'cus_1'),
    );

    expect(result.id).toBe('cust_row_1');
    expect(rows).toEqual([row()]);
  });

  it('rebinds the existing row when the Stripe id changed', async () => {
    const { inTenant, rows, service } = setup([
      row({ stripeCustomerId: 'cus_stale' }),
    ]);

    const result = await inTenant(() =>
      service.upsertForOrganization('org_1', 'cus_fresh'),
    );

    expect(result.stripeCustomerId).toBe('cus_fresh');
    expect(rows).toEqual([row({ stripeCustomerId: 'cus_fresh' })]);
  });

  it('creates the single org row when none exists, ignoring a removed one and other organizations', async () => {
    const { inTenant, rows, service } = setup([
      row({ id: 'cust_row_removed', isDeleted: true }),
      row({ id: 'cust_row_other', organizationId: 'org_2' }),
    ]);

    const result = await inTenant(() =>
      service.upsertForOrganization('org_1', 'cus_new'),
    );

    expect(result).toMatchObject({
      organizationId: 'org_1',
      stripeCustomerId: 'cus_new',
    });
    expect(rows.filter((item) => !item.isDeleted)).toHaveLength(2);
  });

  it('converges on the winning row when a concurrent insert wins the race', async () => {
    const { hooks, inTenant, insert, rows, service } = setup();
    hooks.beforeCreate = () => {
      hooks.beforeCreate = () => undefined;
      insert({ organizationId: 'org_1', stripeCustomerId: 'cus_winner' });
    };

    const result = await inTenant(() =>
      service.upsertForOrganization('org_1', 'cus_loser'),
    );

    expect(result).toMatchObject({
      id: 'cust_row_1',
      stripeCustomerId: 'cus_loser',
    });
    expect(rows).toEqual([row({ stripeCustomerId: 'cus_loser' })]);
  });

  it('rethrows non-unique-violation insert failures', async () => {
    const { hooks, inTenant, rows, service } = setup();
    hooks.failCreate = new Error('db down');

    await expect(
      inTenant(() => service.upsertForOrganization('org_1', 'cus_new')),
    ).rejects.toThrow('db down');
    expect(rows).toEqual([]);
  });

  it('serializes concurrent provisioning and reuses the winning Stripe customer', async () => {
    const { inTenant, rows, service } = setup();
    const stripeCustomersCreated: string[] = [];
    const createStripeCustomer = async (billingEmail: string) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      stripeCustomersCreated.push(billingEmail);
      return billingEmail === 'first@acme.test' ? 'cus_first' : 'cus_second';
    };

    const [first, second] = await inTenant(() =>
      Promise.all([
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
      ]),
    );

    expect(stripeCustomersCreated).toEqual(['first@acme.test']);
    expect(first.stripeCustomerId).toBe('cus_first');
    expect(second.stripeCustomerId).toBe('cus_first');
    expect(rows).toEqual([row({ stripeCustomerId: 'cus_first' })]);
  });
});
