import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { ISubscriptionsService } from '@genfeedai/contracts/interfaces/billing';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

export type WorldRow = Record<string, unknown>;

/** The clock every Stripe webhook world runs on (install with fake timers). */
export const STRIPE_WORLD_NOW = new Date('2026-09-27T00:00:00.000Z');

function isRecord(value: unknown): value is WorldRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

const timeOf = (value: unknown) =>
  value instanceof Date ? value.getTime() : Number(value);

function matchesField(actual: unknown, expected: unknown): boolean {
  if (!isRecord(expected)) return actual === expected;
  if ('startsWith' in expected) {
    return String(actual).startsWith(String(expected.startsWith));
  }
  if ('gte' in expected || 'lt' in expected) {
    return (
      timeOf(actual) >= timeOf(expected.gte ?? Number.NEGATIVE_INFINITY) &&
      timeOf(actual) < timeOf(expected.lt ?? Number.POSITIVE_INFINITY)
    );
  }
  if (Array.isArray(expected.path) && 'equals' in expected) {
    const value = expected.path.reduce<unknown>(
      (current, segment) =>
        isRecord(current) ? current[String(segment)] : undefined,
      actual,
    );
    return value === expected.equals;
  }
  throw new Error(`Unsupported where operator: ${JSON.stringify(expected)}`);
}

/** The subset of Prisma `where` the Stripe webhook code reads; unknown operators throw. */
export function matchesWorldRow(row: WorldRow, where: WorldRow): boolean {
  return Object.entries(where).every(([field, expected]) =>
    field === 'OR'
      ? (expected as WorldRow[]).some((arm) => matchesWorldRow(row, arm))
      : matchesField(row[field], expected),
  );
}

/**
 * In-memory state behind `StripeWebhookSupportService` and the collaborators
 * the Stripe webhook handlers share with it: the credit ledger (with the
 * partial unique index on checkout references), the revenue ledger (unique
 * per Stripe object, rolled back with its transaction), the operator outbox,
 * checkout-session markers, users, organization settings and Skills Pro
 * receipts. Every effect lands in state a spec can read back.
 */
export function stripeWebhookWorld() {
  const state = {
    alerts: [] as WorldRow[],
    config: {} as Record<string, string>,
    delivered: [] as string[],
    faults: {
      alert: [] as Error[],
      grant: [] as unknown[],
      marker: [] as Array<Error | false>,
      organizationLookup: [] as Error[],
      receiptWrite: [] as Error[],
      revenueWrite: [] as Error[],
      settingsPatch: [] as Error[],
      userCreate: [] as unknown[],
    },
    fees: new Map<string, { currency: string; feeMinor: number } | Error>(),
    journal: [] as string[],
    ledger: [] as WorldRow[],
    locks: [] as Array<{ key: string; ttlSeconds: number }>,
    logs: [] as Array<{ level: string; message: string; meta: unknown }>,
    markers: new Map<string, { options: unknown; value: unknown }>(),
    organizations: new Map<string, string>([['org_1', 'Acme Studio']]),
    races: {
      beforeGrant: undefined as (() => void) | undefined,
      beforeUserCreate: undefined as (() => void) | undefined,
    },
    receipts: [] as WorldRow[],
    revenue: [] as WorldRow[],
    settings: [] as WorldRow[],
    subscriptions: [] as Array<{
      organizationId: string;
      stripeCustomerId: string;
      userId: string;
    }>,
    users: [] as WorldRow[],
  };
  let nextId = 0;
  const newId = (prefix: string) => {
    nextId += 1;
    return `${prefix}_${nextId}`;
  };
  const once = (name: keyof typeof state.races) => {
    const race = state.races[name];
    state.races[name] = undefined;
    race?.();
  };

  const configService = {
    get: (key: string) => state.config[key],
  } as unknown as ConfigService;

  const transactionClient = {
    $executeRaw: async () => 0,
    billingRevenueEvent: {
      aggregate: async ({ where }: { where: WorldRow }) => ({
        _sum: {
          amountMinor: state.revenue
            .filter((row) => matchesWorldRow(row, where))
            .reduce((total, row) => total + Number(row.amountMinor), 0),
        },
      }),
      createMany: async ({ data }: { data: WorldRow[] }) => {
        const fault = state.faults.revenueWrite.shift();
        if (fault) throw fault;
        const fresh = data.filter(
          (row) =>
            !state.revenue.some(
              (existing) => existing.stripeObjectId === row.stripeObjectId,
            ),
        );
        state.revenue.push(
          ...fresh.map((row) => ({ isDeleted: false, ...row })),
        );
        return { count: fresh.length };
      },
      findFirst: async ({ where }: { where: WorldRow }) =>
        state.revenue.find((row) => matchesWorldRow(row, where)) ?? null,
    },
  };
  const prisma = {
    ...transactionClient,
    $transaction: async (
      operation: (client: typeof transactionClient) => Promise<unknown>,
    ) => {
      const revenue = structuredClone(state.revenue);
      const alerts = structuredClone(state.alerts);
      try {
        return await operation(transactionClient);
      } catch (error) {
        state.revenue.splice(0, Number.POSITIVE_INFINITY, ...revenue);
        state.alerts.splice(0, Number.POSITIVE_INFINITY, ...alerts);
        throw error;
      }
    },
    creditTransaction: {
      findFirst: async ({ where }: { where: WorldRow }) =>
        state.ledger.find((row) => matchesWorldRow(row, where)) ?? null,
    },
    organization: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const fault = state.faults.organizationLookup.shift();
        if (fault) throw fault;
        const label = state.organizations.get(where.id);
        return label ? { label } : null;
      },
    },
    skillReceipt: {
      create: async ({ data }: { data: WorldRow }) => {
        const fault = state.faults.receiptWrite.shift();
        if (fault) throw fault;
        const row = { id: newId('receipt'), isDeleted: false, ...data };
        state.receipts.push(row);
        return structuredClone(row);
      },
      findFirst: async ({ where }: { where: WorldRow }) => {
        const row = state.receipts.find((item) => matchesWorldRow(item, where));
        return row ? structuredClone(row) : null;
      },
      update: async ({ data, where }: { data: WorldRow; where: WorldRow }) => {
        const row = state.receipts.find((item) => matchesWorldRow(item, where));
        if (!row) throw Object.assign(new Error('missing'), { code: 'P2025' });
        Object.assign(row, data);
        return structuredClone(row);
      },
    },
  };

  const queueAlert = (input: WorldRow) => {
    const fault = state.faults.alert.shift();
    if (fault) throw fault;
    state.alerts.push(input);
    return { pendingDeliveryIds: [`delivery_${state.alerts.length}`] };
  };
  const activityRecorder = {
    afterCommit: async (commit: { pendingDeliveryIds: string[] }) => {
      state.delivered.push(...commit.pendingDeliveryIds);
    },
    dispatch: async (input: WorldRow) => {
      const commit = queueAlert(input);
      state.delivered.push(...commit.pendingDeliveryIds);
    },
    dispatchInTransaction: async (_transaction: unknown, input: WorldRow) =>
      queueAlert(input),
    record: async (input: WorldRow) => {
      state.journal.push(`activity ${JSON.stringify(input)}`);
    },
  };

  const cacheService = {
    exists: async (key: string) => state.markers.has(key),
    generateKey: (...parts: string[]) => parts.join(':'),
    set: async (key: string, value: unknown, options: unknown) => {
      const fault = state.faults.marker.shift();
      if (fault instanceof Error) throw fault;
      if (fault === false) return false;
      state.markers.set(key, { options, value });
      return true;
    },
    withLock: async <T>(key: string, run: () => Promise<T>, ttl: number) => {
      state.locks.push({ key, ttlSeconds: ttl });
      return await run();
    },
  };

  const creditsUtils = {
    addOrganizationCreditsWithExpiration: async (
      organizationId: string,
      amount: number,
      source: string,
      description: string,
      expiresAt: Date,
      options: WorldRow = {},
    ) => {
      once('beforeGrant');
      const fault = state.faults.grant.shift();
      if (fault) throw fault;
      const row: WorldRow = {
        amount,
        category: CreditTransactionCategory.ADD,
        createdAt: new Date(),
        description,
        expiresAt,
        isDeleted: false,
        organizationId,
        source,
        ...options,
      };
      const isDuplicate =
        row.referenceId !== undefined &&
        state.ledger.some(
          (existing) =>
            // The partial unique index covers live rows only.
            !existing.isDeleted &&
            existing.organizationId === organizationId &&
            existing.source === source &&
            existing.referenceType === row.referenceType &&
            existing.referenceId === row.referenceId,
        );
      if (isDuplicate) {
        throw Object.assign(new Error('duplicate grant'), { code: 'P2002' });
      }
      state.ledger.push(row);
    },
    getOrganizationCreditsBalance: async (organizationId: string) =>
      state.ledger
        .filter(
          (row) => row.organizationId === organizationId && !row.isDeleted,
        )
        .reduce((total, row) => total + Number(row.amount), 0),
  };

  const findSettings = async (where: { organizationId: string }) =>
    state.settings.find((row) => row.organizationId === where.organizationId) ??
    null;
  const organizationSettings = {
    findOne: findSettings,
    findOneSelect: findSettings,
    getLatestMajorVersionModelIds: async () => ['model_1', 'model_2'],
    patch: async (id: string, data: WorldRow) => {
      const fault = state.faults.settingsPatch.shift();
      if (fault) throw fault;
      Object.assign(state.settings.find((row) => row.id === id) ?? {}, data);
      state.journal.push(`settings ${id}`);
    },
  };

  const users = {
    create: async (entity: WorldRow) => {
      once('beforeUserCreate');
      const fault = state.faults.userCreate.shift();
      if (fault) throw fault;
      if (state.users.some((row) => row.email === entity.email)) {
        throw Object.assign(new Error('email taken'), { code: 'P2002' });
      }
      const row = {
        email: entity.email,
        firstName: entity.firstName,
        handle: entity.handle,
        id: newId('user'),
        isDeleted: false,
        isOnboardingCompleted: false,
        lastName: entity.lastName,
      };
      state.users.push(row);
      state.journal.push(`create user ${row.id}`);
      return structuredClone(row);
    },
    findOne: async (where: WorldRow) => {
      const row = state.users.find(
        (item) => !item.isDeleted && matchesWorldRow(item, where),
      );
      return row ? structuredClone(row) : null;
    },
    patch: async (id: string, data: WorldRow) => {
      Object.assign(state.users.find((row) => row.id === id) ?? {}, data);
      state.journal.push(`user ${id}`);
    },
  };

  const invalidate = (kind: string) => async (id: string) => {
    state.journal.push(`invalidate ${kind} ${id}`);
  };
  const log = (level: string) => (message: unknown, meta?: unknown) => {
    state.logs.push({ level, message: String(message), meta });
  };
  const logger = {
    error: log('error'),
    log: log('log'),
    warn: log('warn'),
  } as unknown as LoggerService;
  const subscriptions = {
    findByStripeCustomerId: async (stripeCustomerId: string) =>
      state.subscriptions.find(
        (row) => row.stripeCustomerId === stripeCustomerId,
      ) ?? null,
  } as unknown as ISubscriptionsService;
  const accessBootstrap = {
    invalidateForOrganization: invalidate('access-bootstrap org'),
    invalidateForUser: invalidate('access-bootstrap user'),
  } as unknown as AccessBootstrapCacheService;

  const support = new StripeWebhookSupportService(
    runtimeSettingsMock(configService),
    configService,
    cacheService as unknown as CacheService,
    logger,
    prisma as unknown as PrismaService,
    activityRecorder as unknown as ActivityRecorderService,
    new SubscriptionCreditGrantService(
      configService,
      logger,
      {} as StripeService,
    ),
    creditsUtils as unknown as CreditsUtilsService,
    organizationSettings as unknown as OrganizationSettingsService,
    subscriptions,
    users as unknown as UsersService,
    {
      invalidateForOrganization: invalidate('request-context org'),
      invalidateForUser: invalidate('request-context user'),
    } as unknown as RequestContextCacheService,
    accessBootstrap,
    {
      resolveProcessingFee: async (payment: WorldRow) => {
        const fee = state.fees.get(
          String(payment.invoiceId ?? payment.paymentIntentId),
        );
        if (fee instanceof Error) throw fee;
        return fee ?? null;
      },
    } as unknown as StripePaymentRevenueReferenceService,
  );

  return Object.assign(state, {
    collaborators: {
      accessBootstrap,
      creditsUtils: creditsUtils as unknown as CreditsUtilsService,
      logger,
      organizationSettings:
        organizationSettings as unknown as OrganizationSettingsService,
      prisma: prisma as unknown as PrismaService,
      subscriptions,
      users: users as unknown as UsersService,
    },
    newId,
    support,
  });
}

export type StripeWebhookWorld = ReturnType<typeof stripeWebhookWorld>;
