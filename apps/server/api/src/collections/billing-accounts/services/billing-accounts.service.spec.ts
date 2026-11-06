import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountBudgetPolicy,
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
  CreditReservationStatus,
  CreditTransactionCategory,
  MemberRole,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import { PRISMA_MODEL_METADATA } from '@genfeedai/prisma';
import { BillingAccountSerializer } from '@genfeedai/serializers';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  billingAccountModelNamesFromMetadata,
  tenantModelsFromMetadata,
} from '@libs/prisma/discover-tenant-models';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Args = {
  _sum?: Row;
  by?: string[];
  create?: Row;
  data?: Row;
  include?: Record<string, boolean>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  update?: Row;
  where?: Row;
};

const TENANT_MODELS = new Set(
  tenantModelsFromMetadata(PRISMA_MODEL_METADATA).map(({ model }) => model),
);
const BILLING_ACCOUNT_MODELS = new Set(
  [...TENANT_MODELS].filter((model) =>
    billingAccountModelNamesFromMetadata(PRISMA_MODEL_METADATA).has(model),
  ),
);
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const UPDATED_AT = new Date('2026-01-02T00:00:00.000Z');
const DELEGATES = [
  'billingAccount',
  'billingAccountMember',
  'billingAccountOrganization',
  'creditBalance',
  'creditReservation',
  'creditTransaction',
  'customer',
  'member',
  'organization',
  'subscription',
];

function isRecord(value: unknown): value is Row {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function matchesField(actual: unknown, expected: unknown): boolean {
  if (!isRecord(expected)) return actual === expected;
  if ('not' in expected) {
    // SQL `<>` never matches NULL, so neither does Prisma `not`.
    return actual !== null && actual !== undefined && actual !== expected.not;
  }
  if (Array.isArray(expected.in)) return expected.in.includes(actual);
  if ('gte' in expected) return Number(actual) >= Number(expected.gte);
  if ('lt' in expected) return Number(actual) < Number(expected.lt);
  throw new Error(`Unsupported where operator: ${JSON.stringify(expected)}`);
}

/** The subset of Prisma `where` the service reads; unknown operators throw. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, expected]) => {
    if (expected === undefined) return true;
    if (field === 'OR') {
      return (expected as Row[]).some((arm) => matches(row, arm));
    }
    if (!(field in row) && isRecord(expected) && field.includes('_')) {
      // Compound unique key such as `billingAccountId_userId`.
      return matches(row, expected);
    }
    return matchesField(row[field], expected);
  });
}

function applyData(row: Row, data: Row): void {
  for (const [field, value] of Object.entries(data)) {
    row[field] =
      isRecord(value) && 'increment' in value
        ? Number(row[field]) + Number(value.increment)
        : value;
  }
}

/**
 * An in-memory Prisma for the billing-account tables that runs the real CLOUD
 * tenant guard on every query (as the `$allOperations` extension does) and
 * rolls a failed `$transaction` back.
 */
function world() {
  const tables: Tables = Object.fromEntries(
    DELEGATES.map((delegate) => [delegate, []]),
  );
  const queries: string[] = [];
  const transactions: unknown[] = [];
  const races = { beforeWalletUpdate: undefined as (() => void) | undefined };
  let nextId = 0;

  const delegate = (name: string) => {
    const rows = () => tables[name] ?? [];
    const guard = (operation: string, args: Args) => {
      queries.push(`${name}.${operation}`);
      assertTenantScopedQuery({
        args,
        billingAccountModelNames: BILLING_ACCOUNT_MODELS,
        isCloud: true,
        model: `${name[0]?.toUpperCase()}${name.slice(1)}`,
        operation,
        tenantModelNames: TENANT_MODELS,
      });
    };
    const select = (args: Args) => {
      const found = rows().filter((row) => matches(row, args.where ?? {}));
      const [field, direction] = Object.entries(args.orderBy ?? {})[0] ?? [];
      const ordered = field
        ? [...found].sort(
            (a, b) =>
              (Number(a[field]) - Number(b[field])) *
              (direction === 'desc' ? -1 : 1),
          )
        : found;
      return ordered.map((row) => {
        const included = Object.keys(args.include ?? {}).map((relation) => [
          relation,
          tables[relation]?.find((other) => other.id === row[`${relation}Id`]),
        ]);
        return { ...structuredClone(row), ...Object.fromEntries(included) };
      });
    };
    const insert = (data: Row) => {
      nextId += 1;
      const row: Row = {
        createdAt: CREATED_AT,
        id: `${name}_${nextId}`,
        isDeleted: false,
        updatedAt: UPDATED_AT,
        ...data,
      };
      rows().push(row);
      return structuredClone(row);
    };
    return {
      count: async (args: Args) => {
        guard('count', args);
        return select(args).length;
      },
      create: async (args: Args) => {
        guard('create', args);
        return insert(args.data ?? {});
      },
      findFirst: async (args: Args) => {
        guard('findFirst', args);
        return select(args)[0] ?? null;
      },
      findMany: async (args: Args) => {
        guard('findMany', args);
        return select(args);
      },
      groupBy: async (args: Args) => {
        guard('groupBy', args);
        const groups = new Map<string, Row>();
        for (const row of select(args)) {
          const keys = Object.fromEntries(
            (args.by ?? []).map((field) => [field, row[field]]),
          );
          const id = JSON.stringify(keys);
          const group = groups.get(id) ?? { ...keys, _sum: { amount: 0 } };
          const sum = group._sum as { amount: number };
          sum.amount += Number(row.amount);
          groups.set(id, group);
        }
        return [...groups.values()];
      },
      update: async (args: Args) => {
        guard('update', args);
        const row = rows().find((item) => matches(item, args.where ?? {}));
        if (!row)
          throw Object.assign(new Error('not found'), { code: 'P2025' });
        applyData(row, args.data ?? {});
        return structuredClone(row);
      },
      updateMany: async (args: Args) => {
        guard('updateMany', args);
        const race =
          name === 'creditBalance' ? races.beforeWalletUpdate : undefined;
        races.beforeWalletUpdate = undefined;
        race?.();
        const matched = rows().filter((row) => matches(row, args.where ?? {}));
        for (const row of matched) applyData(row, args.data ?? {});
        return { count: matched.length };
      },
      upsert: async (args: Args) => {
        guard('upsert', args);
        const row = rows().find((item) => matches(item, args.where ?? {}));
        if (!row) return insert(args.create ?? {});
        applyData(row, args.update ?? {});
        return structuredClone(row);
      },
    };
  };

  const client = Object.fromEntries(
    DELEGATES.map((name) => [name, delegate(name)]),
  );
  const prisma = {
    ...client,
    $transaction: async (
      operation: (tx: typeof client) => Promise<unknown>,
      options: unknown,
    ) => {
      transactions.push(options);
      const snapshot = structuredClone(tables);
      try {
        return await operation(client);
      } catch (error) {
        for (const name of DELEGATES) {
          tables[name]?.splice(
            0,
            Number.POSITIVE_INFINITY,
            ...(snapshot[name] ?? []),
          );
        }
        throw error;
      }
    },
  };

  const service = new BillingAccountsService(
    prisma as unknown as PrismaService,
    { log: () => undefined } as unknown as LoggerService,
  );

  const seed = (name: string, row: Row) => {
    tables[name]?.push({ isDeleted: false, ...row });
  };

  return {
    account: (id: string, overrides: Row = {}) =>
      seed('billingAccount', {
        createdAt: CREATED_AT,
        id,
        label: `Account ${id}`,
        planTier: SubscriptionTier.SCALE,
        status: BillingAccountStatus.ACTIVE,
        stripeCustomerId: null,
        updatedAt: UPDATED_AT,
        ...overrides,
      }),
    billingRole: (
      billingAccountId: string,
      userId: string,
      role: BillingAccountMemberRole,
      overrides: Row = {},
    ) =>
      seed('billingAccountMember', {
        billingAccountId,
        id: `bam_${billingAccountId}_${userId}`,
        role,
        userId,
        ...overrides,
      }),
    /** Every table, as stored, for whole-state comparisons. */
    dump: () => structuredClone(tables),
    link: (
      billingAccountId: string,
      organizationId: string,
      overrides: Row = {},
    ) =>
      seed('billingAccountOrganization', {
        billingAccountId,
        budgetPolicy: null,
        id: `link_${billingAccountId}_${organizationId}`,
        linkedAt: CREATED_AT,
        monthlyBudgetCredits: null,
        organizationId,
        status: BillingAccountOrganizationStatus.LINKED,
        ...overrides,
      }),
    organization: (id: string, billingAccountId: string | null, label = id) =>
      seed('organization', { billingAccountId, id, label }),
    orgRole: (
      organizationId: string,
      userId: string,
      key: string,
      roleKey = key,
    ) =>
      seed('member', {
        id: `member_${organizationId}_${userId}`,
        isActive: true,
        organizationId,
        role: { key },
        roleKey,
        userId,
      }),
    patch: (name: string, id: string, data: Row) => {
      Object.assign(tables[name]?.find((row) => row.id === id) ?? {}, data);
    },
    queries,
    races,
    rows: (name: string) => structuredClone(tables[name] ?? []),
    seed,
    service,
    transactions,
    wallet: (id: string, overrides: Row = {}) =>
      seed('creditBalance', {
        balance: 0,
        billingAccountId: null,
        heldAmount: 0,
        id,
        organizationId: null,
        version: 0,
        ...overrides,
      }),
  };
}
type World = ReturnType<typeof world>;

/**
 * ba_1 (Scale, unlimited organizations) is linked to org_1 and owns the
 * shared wallet; org_2 is unlinked. user_1 owns ba_1 and both organizations.
 */
function sharedAccount(): World {
  const w = world();
  w.account('ba_1');
  w.billingRole('ba_1', 'user_1', BillingAccountMemberRole.OWNER);
  w.organization('org_1', 'ba_1', 'Org One');
  w.organization('org_2', null, 'Org Two');
  w.orgRole('org_1', 'user_1', MemberRole.OWNER);
  w.orgRole('org_2', 'user_1', MemberRole.ADMIN);
  w.link('ba_1', 'org_1');
  w.wallet('wallet_shared', {
    balance: 100,
    billingAccountId: 'ba_1',
    heldAmount: 10,
    organizationId: 'org_1',
  });
  return w;
}

const LINK_ORG_2 = {
  actorUserId: 'user_1',
  billingAccountId: 'ba_1',
  organizationId: 'org_2',
};

function linksOf(w: World) {
  return w
    .rows('billingAccountOrganization')
    .map(
      (row) => `${row.billingAccountId}/${row.organizationId}/${row.status}`,
    );
}

function organizationAccount(w: World, organizationId: string) {
  return w.rows('organization').find((row) => row.id === organizationId)
    ?.billingAccountId;
}

describe('BillingAccountsService', () => {
  describe('requireRole', () => {
    it.each([
      [BillingAccountMemberRole.OWNER, BillingAccountMemberRole.ADMINISTRATOR],
      [BillingAccountMemberRole.VIEWER, BillingAccountMemberRole.VIEWER],
    ])('accepts a %s where %s is required', async (held, required) => {
      const w = world();
      w.billingRole('ba_1', 'user_1', held);

      await expect(
        w.service.requireRole('ba_1', 'user_1', required),
      ).resolves.toBe(held);
    });

    it.each<[string, (w: World) => void]>([
      ['no billing role', () => undefined],
      [
        'a viewer role where an administrator is required',
        (w) => w.billingRole('ba_1', 'user_1', BillingAccountMemberRole.VIEWER),
      ],
      [
        'a revoked owner role',
        (w) =>
          w.billingRole('ba_1', 'user_1', BillingAccountMemberRole.OWNER, {
            isDeleted: true,
          }),
      ],
      [
        'an owner role on another billing account',
        (w) => w.billingRole('ba_2', 'user_1', BillingAccountMemberRole.OWNER),
      ],
    ])('refuses billing administration with %s', async (_name, arrange) => {
      const w = world();
      arrange(w);

      await expect(
        w.service.requireRole(
          'ba_1',
          'user_1',
          BillingAccountMemberRole.ADMINISTRATOR,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('linkOrganization', () => {
    it('merges the organization wallet into the shared wallet and repoints its billing records, under the target organization tenant', async () => {
      const w = sharedAccount();
      w.wallet('wallet_org', {
        balance: 25,
        heldAmount: 5,
        organizationId: 'org_2',
      });
      w.seed('customer', { id: 'cus_row', organizationId: 'org_2' });
      w.seed('subscription', { id: 'sub_row', organizationId: 'org_2' });
      w.seed('creditTransaction', {
        billingAccountId: null,
        id: 'tx_unattributed',
        organizationId: 'org_2',
      });
      w.seed('creditTransaction', {
        billingAccountId: 'ba_other',
        id: 'tx_attributed',
        organizationId: 'org_2',
      });
      w.seed('creditReservation', {
        billingAccountId: null,
        id: 'hold_open',
        organizationId: 'org_2',
        status: CreditReservationStatus.RESERVED,
      });
      w.seed('creditReservation', {
        billingAccountId: null,
        id: 'hold_settled',
        organizationId: 'org_2',
        status: CreditReservationStatus.SETTLED,
      });

      // The session organization is org_1; the linked organization is org_2.
      const linked = await runWithTenantContext(
        { organizationId: 'org_1' },
        () => w.service.linkOrganization(LINK_ORG_2),
      );

      expect(linked.id).toBe('ba_1');
      expect(w.transactions).toEqual([{ isolationLevel: 'Serializable' }]);
      expect(linksOf(w)).toEqual(['ba_1/org_1/LINKED', 'ba_1/org_2/LINKED']);
      expect(organizationAccount(w, 'org_2')).toBe('ba_1');
      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 125,
          heldAmount: 15,
          id: 'wallet_shared',
          isDeleted: false,
          version: 1,
        }),
        expect.objectContaining({
          balance: 25,
          id: 'wallet_org',
          isDeleted: true,
        }),
      ]);
      expect(
        [
          'customer',
          'subscription',
          'creditTransaction',
          'creditReservation',
        ].map((name) =>
          w.rows(name).map((row) => `${row.id}:${row.billingAccountId}`),
        ),
      ).toEqual([
        ['cus_row:ba_1'],
        ['sub_row:ba_1'],
        ['tx_unattributed:ba_1', 'tx_attributed:ba_other'],
        ['hold_open:ba_1', 'hold_settled:null'],
      ]);
    });

    it('attaches an organization wallet to an account that has none', async () => {
      const w = world();
      w.account('ba_solo');
      w.billingRole(
        'ba_solo',
        'user_1',
        BillingAccountMemberRole.ADMINISTRATOR,
      );
      w.organization('org_2', null);
      w.orgRole('org_2', 'user_1', MemberRole.OWNER);
      w.wallet('wallet_org', { balance: 25, organizationId: 'org_2' });

      await w.service.linkOrganization({
        ...LINK_ORG_2,
        billingAccountId: 'ba_solo',
      });

      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 25,
          billingAccountId: 'ba_solo',
          id: 'wallet_org',
          isDeleted: false,
        }),
      ]);
    });

    it('opens an empty shared wallet when neither side has one', async () => {
      const w = world();
      w.account('ba_solo');
      w.billingRole('ba_solo', 'user_1', BillingAccountMemberRole.OWNER);
      w.organization('org_2', null);
      w.orgRole('org_2', 'user_1', MemberRole.OWNER);

      await w.service.linkOrganization({
        ...LINK_ORG_2,
        billingAccountId: 'ba_solo',
      });

      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 0,
          billingAccountId: 'ba_solo',
          heldAmount: 0,
          organizationId: 'org_2',
          version: 0,
        }),
      ]);
    });

    it('re-links an already linked organization without a second link or wallet change', async () => {
      const w = sharedAccount();
      const before = w.rows('creditBalance');

      await w.service.linkOrganization({
        ...LINK_ORG_2,
        organizationId: 'org_1',
      });

      expect(linksOf(w)).toEqual(['ba_1/org_1/LINKED']);
      expect(w.rows('creditBalance')).toEqual(before);
    });

    it.each<[string, (w: World) => void, string, unknown]>([
      [
        'an unknown billing account',
        () => undefined,
        'ba_missing',
        NotFoundException,
      ],
      [
        'an actor who only views the billing account',
        (w) =>
          w.patch('billingAccountMember', 'bam_ba_1_user_1', {
            role: BillingAccountMemberRole.VIEWER,
          }),
        'ba_1',
        ForbiddenException,
      ],
      [
        'an actor who does not administer the target organization',
        (w) =>
          w.patch('member', 'member_org_2_user_1', { role: { key: 'viewer' } }),
        'ba_1',
        ForbiddenException,
      ],
      [
        'a deleted target organization',
        (w) => w.patch('organization', 'org_2', { isDeleted: true }),
        'ba_1',
        NotFoundException,
      ],
      [
        'an organization owned by another billing account',
        (w) =>
          w.patch('organization', 'org_2', { billingAccountId: 'ba_other' }),
        'ba_1',
        ConflictException,
      ],
      [
        'an organization actively linked to another billing account',
        (w) => w.link('ba_other', 'org_2'),
        'ba_1',
        ConflictException,
      ],
      [
        'an organization wallet held by another billing account',
        (w) =>
          w.wallet('wallet_org', {
            billingAccountId: 'ba_other',
            organizationId: 'org_2',
          }),
        'ba_1',
        ConflictException,
      ],
      [
        'a Pro account that already links its one organization',
        (w) =>
          w.patch('billingAccount', 'ba_1', { planTier: SubscriptionTier.PRO }),
        'ba_1',
        PlanLimitExceededException,
      ],
    ])(
      'refuses %s and leaves every table as it was',
      async (_name, arrange, billingAccountId, error) => {
        const w = sharedAccount();
        arrange(w);
        const before = w.dump();

        await expect(
          w.service.linkOrganization({ ...LINK_ORG_2, billingAccountId }),
        ).rejects.toBeInstanceOf(error);

        expect(w.dump()).toEqual(before);
      },
    );

    it('rolls the whole link back when the shared wallet changes mid-merge', async () => {
      const w = sharedAccount();
      w.wallet('wallet_org', { balance: 25, organizationId: 'org_2' });
      w.races.beforeWalletUpdate = () => {
        w.patch('creditBalance', 'wallet_shared', { isDeleted: true });
      };

      await expect(w.service.linkOrganization(LINK_ORG_2)).rejects.toThrow(
        'Billing account credit balance changed during organization link',
      );

      expect(linksOf(w)).toEqual(['ba_1/org_1/LINKED']);
      expect(organizationAccount(w, 'org_2')).toBeNull();
      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 100,
          id: 'wallet_shared',
          version: 0,
        }),
        expect.objectContaining({
          balance: 25,
          id: 'wallet_org',
          isDeleted: false,
        }),
      ]);
    });
  });

  describe('ensureForOrganization', () => {
    function newOrganization(): World {
      const w = world();
      w.organization('org_9', null, 'Org Nine');
      w.orgRole('org_9', 'user_9', MemberRole.OWNER);
      return w;
    }

    it('opens an unprovisioned account owned by the creator and links the organization to it', async () => {
      const w = newOrganization();

      const account = await w.service.ensureForOrganization({
        organizationId: 'org_9',
        planTier: SubscriptionTier.FREE,
        userId: 'user_9',
      });

      expect(w.rows('billingAccount')).toEqual([
        expect.objectContaining({
          id: account.id,
          label: 'Org Nine',
          planTier: SubscriptionTier.FREE,
          status: BillingAccountStatus.UNPROVISIONED,
        }),
      ]);
      expect(w.rows('billingAccountMember')).toEqual([
        expect.objectContaining({
          billingAccountId: account.id,
          role: BillingAccountMemberRole.OWNER,
          userId: 'user_9',
        }),
      ]);
      expect(linksOf(w)).toEqual([`${account.id}/org_9/LINKED`]);
      expect(organizationAccount(w, 'org_9')).toBe(account.id);
      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 0,
          billingAccountId: account.id,
          organizationId: 'org_9',
        }),
      ]);
    });

    it('labels a new account as asked', async () => {
      const w = newOrganization();

      await w.service.ensureForOrganization({
        label: 'Agency billing',
        organizationId: 'org_9',
        userId: 'user_9',
      });

      expect(w.rows('billingAccount')).toEqual([
        expect.objectContaining({ label: 'Agency billing', planTier: null }),
      ]);
    });

    it('links into the single owned account that still has room', async () => {
      const w = sharedAccount();

      const account = await w.service.ensureForOrganization({
        organizationId: 'org_2',
        userId: 'user_1',
      });

      expect(account.id).toBe('ba_1');
      expect(w.rows('billingAccount')).toHaveLength(1);
      expect(linksOf(w)).toEqual(['ba_1/org_1/LINKED', 'ba_1/org_2/LINKED']);
    });

    it('refuses ordinary provisioning past the owned account organization limit, writing nothing', async () => {
      const w = sharedAccount();
      w.patch('billingAccount', 'ba_1', { planTier: SubscriptionTier.FREE });
      const before = w.dump();

      const rejection = w.service.ensureForOrganization({
        organizationId: 'org_2',
        userId: 'user_1',
      });

      await expect(rejection).rejects.toBeInstanceOf(
        PlanLimitExceededException,
      );
      await expect(rejection).rejects.toMatchObject({
        response: {
          meta: {
            currentCount: 1,
            limit: 1,
            resource: 'organizations',
            upgradeTier: SubscriptionTier.SCALE,
          },
        },
      });
      expect(w.dump()).toEqual(before);
    });

    it.each<[string, (w: World) => void, boolean]>([
      [
        'a separate account despite a full owned one',
        (w) =>
          w.patch('billingAccount', 'ba_1', {
            planTier: SubscriptionTier.FREE,
          }),
        true,
      ],
      [
        'a new account when the creator owns two',
        (w) => {
          w.account('ba_2');
          w.billingRole('ba_2', 'user_1', BillingAccountMemberRole.OWNER);
        },
        false,
      ],
      [
        'a new account when the owned one is deleted',
        (w) => w.patch('billingAccount', 'ba_1', { isDeleted: true }),
        false,
      ],
      [
        'a new account when the creator only administers one',
        (w) =>
          w.patch('billingAccountMember', 'bam_ba_1_user_1', {
            role: BillingAccountMemberRole.ADMINISTRATOR,
          }),
        false,
      ],
    ])('opens %s', async (_name, arrange, isSeparateAccount) => {
      const w = sharedAccount();
      arrange(w);

      const account = await w.service.ensureForOrganization({
        isSeparateAccount,
        organizationId: 'org_2',
        userId: 'user_1',
      });

      expect(account.id).not.toBe('ba_1');
      expect(organizationAccount(w, 'org_2')).toBe(account.id);
      expect(linksOf(w)).toEqual([
        'ba_1/org_1/LINKED',
        `${account.id}/org_2/LINKED`,
      ]);
    });

    it('returns the account an organization already belongs to without writing', async () => {
      const w = sharedAccount();
      const before = w.dump();

      const account = await w.service.ensureForOrganization({
        organizationId: 'org_1',
        userId: 'user_1',
      });

      expect(account).toMatchObject({ id: 'ba_1', label: 'Account ba_1' });
      expect(w.dump()).toEqual(before);
    });

    it('links into an explicitly named account', async () => {
      const w = sharedAccount();
      w.account('ba_2');
      w.billingRole('ba_2', 'user_1', BillingAccountMemberRole.ADMINISTRATOR);

      await w.service.ensureForOrganization({
        billingAccountId: 'ba_2',
        organizationId: 'org_2',
        userId: 'user_1',
      });

      expect(organizationAccount(w, 'org_2')).toBe('ba_2');
    });

    it('refuses an unknown organization', async () => {
      const w = world();

      await expect(
        w.service.ensureForOrganization({
          organizationId: 'org_missing',
          userId: 'user_1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(w.rows('billingAccount')).toEqual([]);
    });
  });

  describe('detachOrganization', () => {
    /** org_1 and org_2 share ba_1, whose wallet names org_2. */
    function twoLinked(): World {
      const w = sharedAccount();
      w.patch('organization', 'org_2', { billingAccountId: 'ba_1' });
      w.patch('creditBalance', 'wallet_shared', { organizationId: 'org_2' });
      w.link('ba_1', 'org_2', { linkedAt: UPDATED_AT });
      return w;
    }
    const DETACH_ORG_2 = LINK_ORG_2;

    it('detaches a sibling organization under its own tenant onto a fresh account, handing the shared wallet to the remaining organization', async () => {
      const w = twoLinked();

      // The session organization is org_1; the detached sibling is org_2.
      const replacement = await runWithTenantContext(
        { organizationId: 'org_1' },
        () => w.service.detachOrganization(DETACH_ORG_2),
      );

      expect(w.transactions).toEqual([{ isolationLevel: 'Serializable' }]);
      expect(linksOf(w)).toEqual([
        'ba_1/org_1/LINKED',
        'ba_1/org_2/DETACHED',
        `${replacement.id}/org_2/LINKED`,
      ]);
      expect(
        w.rows('billingAccountOrganization')[1]?.detachedAt,
      ).toBeInstanceOf(Date);
      expect(w.rows('billingAccount')).toEqual([
        expect.objectContaining({ id: 'ba_1' }),
        expect.objectContaining({
          id: replacement.id,
          label: null,
          status: BillingAccountStatus.UNPROVISIONED,
        }),
      ]);
      expect(w.rows('billingAccountMember')).toEqual([
        expect.objectContaining({ billingAccountId: 'ba_1', userId: 'user_1' }),
        expect.objectContaining({
          billingAccountId: replacement.id,
          role: BillingAccountMemberRole.OWNER,
          userId: 'user_1',
        }),
      ]);
      expect(organizationAccount(w, 'org_2')).toBe(replacement.id);
      expect(w.rows('creditBalance')).toEqual([
        expect.objectContaining({
          balance: 100,
          billingAccountId: 'ba_1',
          id: 'wallet_shared',
          organizationId: 'org_1',
        }),
        expect.objectContaining({
          balance: 0,
          billingAccountId: replacement.id,
          heldAmount: 0,
          organizationId: 'org_2',
        }),
      ]);
    });

    it('leaves the shared wallet unnamed when no organization remains linked', async () => {
      const w = twoLinked();
      w.patch('billingAccountOrganization', 'link_ba_1_org_1', {
        status: BillingAccountOrganizationStatus.DETACHED,
      });

      await w.service.detachOrganization(DETACH_ORG_2);

      expect(w.rows('creditBalance')[0]).toMatchObject({
        id: 'wallet_shared',
        organizationId: null,
      });
    });

    it('keeps a shared wallet that names another organization', async () => {
      const w = twoLinked();
      w.patch('creditBalance', 'wallet_shared', { organizationId: 'org_1' });

      await w.service.detachOrganization(DETACH_ORG_2);

      expect(w.rows('creditBalance')[0]).toMatchObject({
        id: 'wallet_shared',
        organizationId: 'org_1',
      });
    });

    it.each<[string, (w: World) => void, unknown]>([
      [
        'an actor who administers but does not own the billing account',
        (w) =>
          w.patch('billingAccountMember', 'bam_ba_1_user_1', {
            role: BillingAccountMemberRole.ADMINISTRATOR,
          }),
        ForbiddenException,
      ],
      [
        'an actor who is a normal member of the detached organization',
        (w) =>
          w.patch('member', 'member_org_2_user_1', { role: { key: 'viewer' } }),
        ForbiddenException,
      ],
      [
        'an actor demoted through roleId whose roleKey copy is stale',
        (w) =>
          w.patch('member', 'member_org_2_user_1', {
            role: { key: 'user' },
            roleKey: MemberRole.ADMIN,
          }),
        ForbiddenException,
      ],
      [
        'an organization with unsettled credit reservations',
        (w) =>
          w.seed('creditReservation', {
            billingAccountId: 'ba_1',
            id: 'hold_open',
            organizationId: 'org_2',
            status: CreditReservationStatus.RESERVED,
          }),
        ConflictException,
      ],
      [
        'an organization that is not actively linked',
        (w) =>
          w.patch('billingAccountOrganization', 'link_ba_1_org_2', {
            status: BillingAccountOrganizationStatus.DETACHED,
          }),
        ConflictException,
      ],
    ])(
      'refuses %s and leaves every table as it was',
      async (_name, arrange, error) => {
        const w = twoLinked();
        arrange(w);
        const before = w.dump();

        await expect(
          runWithTenantContext({ organizationId: 'org_1' }, () =>
            w.service.detachOrganization(DETACH_ORG_2),
          ),
        ).rejects.toBeInstanceOf(error);

        expect(w.dump()).toEqual(before);
      },
    );
  });

  describe('billing roles', () => {
    function owned(): World {
      const w = world();
      w.account('ba_1');
      w.billingRole('ba_1', 'owner_1', BillingAccountMemberRole.OWNER);
      return w;
    }

    it('grants a role, and a later grant revives the revoked row with the new role', async () => {
      const w = owned();
      const grant = (role: BillingAccountMemberRole) =>
        w.service.grantRole({
          actorUserId: 'owner_1',
          billingAccountId: 'ba_1',
          role,
          userId: 'admin_1',
        });

      await grant(BillingAccountMemberRole.ADMINISTRATOR);
      await w.service.revokeRole({
        actorUserId: 'owner_1',
        billingAccountId: 'ba_1',
        userId: 'admin_1',
      });
      await grant(BillingAccountMemberRole.VIEWER);

      expect(
        w
          .rows('billingAccountMember')
          .map((row) => `${row.userId}:${row.role}:${row.isDeleted}`),
      ).toEqual(['owner_1:OWNER:false', 'admin_1:VIEWER:false']);
    });

    it('revokes a role by soft delete and keeps the billing account', async () => {
      const w = owned();
      w.billingRole('ba_1', 'admin_1', BillingAccountMemberRole.ADMINISTRATOR);
      const account = w.rows('billingAccount');

      await w.service.revokeRole({
        actorUserId: 'owner_1',
        billingAccountId: 'ba_1',
        userId: 'admin_1',
      });

      expect(w.rows('billingAccountMember')[1]).toMatchObject({
        isDeleted: true,
        userId: 'admin_1',
      });
      expect(w.rows('billingAccount')).toEqual(account);
    });

    it.each<[string, (service: BillingAccountsService) => Promise<unknown>]>([
      [
        'an administrator granting a role',
        (service) =>
          service.grantRole({
            actorUserId: 'admin_1',
            billingAccountId: 'ba_1',
            role: BillingAccountMemberRole.OWNER,
            userId: 'admin_1',
          }),
      ],
      [
        'an administrator revoking a role',
        (service) =>
          service.revokeRole({
            actorUserId: 'admin_1',
            billingAccountId: 'ba_1',
            userId: 'owner_1',
          }),
      ],
      [
        'an owner revoking their own role',
        (service) =>
          service.revokeRole({
            actorUserId: 'owner_1',
            billingAccountId: 'ba_1',
            userId: 'owner_1',
          }),
      ],
    ])('refuses %s without changing roles', async (_name, act) => {
      const w = owned();
      w.billingRole('ba_1', 'admin_1', BillingAccountMemberRole.ADMINISTRATOR);
      const before = w.dump();

      await expect(act(w.service)).rejects.toBeInstanceOf(ForbiddenException);

      expect(w.dump()).toEqual(before);
    });
  });

  describe('account status and Stripe customer', () => {
    it('records a new account status', async () => {
      const w = world();
      w.account('ba_1');

      await w.service.markStatus('ba_1', BillingAccountStatus.PAST_DUE);

      expect(w.rows('billingAccount')[0]?.status).toBe(
        BillingAccountStatus.PAST_DUE,
      );
    });

    it.each([
      ['an account with no customer yet', null],
      ['an account already attached to the same customer', 'cus_new'],
    ])(
      'attaches the Stripe customer to %s and activates it',
      async (_name, current) => {
        const w = world();
        w.account('ba_1', {
          status: BillingAccountStatus.UNPROVISIONED,
          stripeCustomerId: current,
        });

        await w.service.attachStripeCustomer('ba_1', 'cus_new');

        expect(w.rows('billingAccount')[0]).toMatchObject({
          status: BillingAccountStatus.ACTIVE,
          stripeCustomerId: 'cus_new',
        });
      },
    );

    it.each([
      ['attached to another customer', { stripeCustomerId: 'cus_old' }],
      ['deleted', { isDeleted: true, stripeCustomerId: null }],
    ])('fails closed for an account %s', async (_name, overrides) => {
      const w = world();
      w.account('ba_1', {
        status: BillingAccountStatus.UNPROVISIONED,
        ...overrides,
      });
      const before = w.dump();

      await expect(
        w.service.attachStripeCustomer('ba_1', 'cus_new'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(w.dump()).toEqual(before);
    });
  });

  describe('getSnapshot (#5374)', () => {
    /** ba_1 links org_1 and org_2 (org_3 was detached) with a usage ledger. */
    function reporting(): World {
      const w = world();
      w.account('ba_1', {
        label: 'Shared Account',
        planTier: SubscriptionTier.PRO,
      });
      w.organization('org_1', 'ba_1', 'Org One');
      w.organization('org_2', 'ba_1', 'Org Two');
      w.organization('org_3', null, 'Org Three');
      w.link('ba_1', 'org_1', {
        budgetPolicy: BillingAccountBudgetPolicy.WARNING,
        monthlyBudgetCredits: 500,
      });
      w.link('ba_1', 'org_2');
      w.link('ba_1', 'org_3', {
        status: BillingAccountOrganizationStatus.DETACHED,
      });
      w.wallet('wallet_shared', {
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 10,
        organizationId: 'org_1',
      });
      w.seed('subscription', {
        billingAccountId: 'ba_1',
        currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
        id: 'sub_1',
        organizationId: 'org_1',
        status: 'active',
      });
      const ledger: Array<[string, string, number, Row?]> = [
        ['org_1', CreditTransactionCategory.DEDUCT, 5],
        ['org_1', CreditTransactionCategory.REFUND, 2],
        // A legacy negative-signed deduction counts its magnitude.
        ['org_1', CreditTransactionCategory.DEDUCT, -4],
        // Referral reward reversals, other categories, deleted rows and
        // another account's rows are not usage.
        [
          'org_1',
          CreditTransactionCategory.DEDUCT,
          50,
          { referenceType: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE },
        ],
        ['org_1', CreditTransactionCategory.BYOK_USAGE, 1000],
        ['org_1', CreditTransactionCategory.DEDUCT, 30, { isDeleted: true }],
        [
          'org_1',
          CreditTransactionCategory.DEDUCT,
          77,
          { billingAccountId: 'ba_other' },
        ],
        ['org_2', CreditTransactionCategory.DEDUCT, 9],
      ];
      ledger.forEach(([organizationId, category, amount, overrides], index) => {
        w.seed('creditTransaction', {
          amount,
          billingAccountId: 'ba_1',
          category,
          id: `tx_${index}`,
          organizationId,
          referenceType: null,
          ...overrides,
        });
      });
      return w;
    }

    it('returns the full snapshot, including another linked organization, to a viewer', async () => {
      const w = reporting();
      w.billingRole('ba_1', 'user_viewer', BillingAccountMemberRole.VIEWER);

      const snapshot = await runWithTenantContext(
        { organizationId: 'org_1' },
        () => w.service.getSnapshot('org_1', 'user_viewer'),
      );

      expect(snapshot).toEqual({
        callerRole: BillingAccountMemberRole.VIEWER,
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        id: 'ba_1',
        isDeleted: false,
        isIdentityStale: false,
        kind: 'account',
        label: 'Shared Account',
        linkedOrganizations: [
          {
            budgetPolicy: BillingAccountBudgetPolicy.WARNING,
            label: 'Org One',
            monthlyBudgetCredits: 500,
            organizationId: 'org_1',
            status: BillingAccountOrganizationStatus.LINKED,
            // Usage nets refunds and skips referral reward reversals (#6008).
            usage: 7,
          },
          {
            budgetPolicy: null,
            label: 'Org Two',
            monthlyBudgetCredits: null,
            organizationId: 'org_2',
            status: BillingAccountOrganizationStatus.LINKED,
            usage: 9,
          },
        ],
        planTier: SubscriptionTier.PRO,
        status: BillingAccountStatus.ACTIVE,
        subscriptionStatus: 'active',
        updatedAt: '2026-01-02T00:00:00.000Z',
        wallet: { available: 90, held: 10, settled: 100 },
      });
    });

    it.each([
      [
        BillingAccountMemberRole.OWNER,
        BillingAccountStatus.ACTIVE,
        [true, true, true, true, true, true],
        false,
      ],
      [
        BillingAccountMemberRole.ADMINISTRATOR,
        BillingAccountStatus.UNPROVISIONED,
        [true, false, false, true, false, false],
        false,
      ],
      [
        BillingAccountMemberRole.ADMINISTRATOR,
        BillingAccountStatus.PAST_DUE,
        [false, false, false, true, false, false],
        false,
      ],
      [
        BillingAccountMemberRole.OWNER,
        BillingAccountStatus.STALE,
        [false, true, true, true, true, false],
        true,
      ],
    ])(
      'gives a %s on a %s account its capabilities',
      async (role, status, flags, isIdentityStale) => {
        const w = reporting();
        w.patch('billingAccount', 'ba_1', { status });
        w.billingRole('ba_1', 'user_1', role);

        const snapshot = await w.service.getSnapshot('org_1', 'user_1');

        expect(snapshot).toMatchObject({
          capabilities: {
            canCheckout: flags[0],
            canDetachOrganization: flags[1],
            canLinkOrganization: flags[2],
            canManageBudgets: flags[3],
            canManageMembers: flags[4],
            canOpenPortal: flags[5],
          },
          isIdentityStale,
        });
      },
    );

    it('returns only its own organization usage, budget and link status to a caller with no billing role, reading no other organization', async () => {
      const w = reporting();

      const snapshot = await runWithTenantContext(
        { organizationId: 'org_1' },
        () => w.service.getSnapshot('org_1', 'user_plain_member'),
      );

      expect(snapshot).toEqual({
        budgetPolicy: BillingAccountBudgetPolicy.WARNING,
        callerRole: null,
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        id: 'ba_1',
        isLinked: true,
        kind: 'organization',
        monthlyBudgetCredits: 500,
        organizationId: 'org_1',
        usage: 7,
      });
      expect(BillingAccountSerializer.serialize(snapshot).data).toMatchObject({
        attributes: { kind: 'organization', organizationId: 'org_1' },
        id: 'ba_1',
        type: 'billing-account',
      });
      // No cross-organization, wallet or subscription reads at all: this is
      // the enforcement point, not just the returned shape (#5374).
      expect(w.queries).not.toContain('billingAccountOrganization.findMany');
      expect(w.queries).not.toContain('creditBalance.findFirst');
      expect(w.queries).not.toContain('subscription.findFirst');
    });

    it('reads the newest link row after a detach-and-relink cycle', async () => {
      const w = reporting();
      w.link('ba_1', 'org_3', {
        id: 'link_relinked',
        linkedAt: UPDATED_AT,
        monthlyBudgetCredits: 40,
      });
      w.patch('organization', 'org_3', { billingAccountId: 'ba_1' });

      const snapshot = await w.service.getSnapshot(
        'org_3',
        'user_plain_member',
      );

      expect(snapshot).toMatchObject({
        isLinked: true,
        monthlyBudgetCredits: 40,
        usage: 0,
      });
    });
  });
});
