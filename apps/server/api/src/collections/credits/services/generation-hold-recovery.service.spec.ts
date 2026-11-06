import type { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { avatarEngineSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditHoldRecoveryAction,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { CreditHoldRecoveryInput } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  usesMeteredCredits: () => true,
}));

type Row = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;
const HEYGEN = {
  assetId: 'asset',
  submissionIntent: { provider: 'heygen', version: 1 },
};
const AVATAR_QUOTE = {
  ...HEYGEN,
  avatarDurationQuote: {
    estimatedSeconds: 10,
    snapshot: avatarEngineSnapshot('heygen/avatar-iv', 'photo_avatar', 10),
  },
};

const makeHold = (fields: Row = {}): Row => ({
  actorUserId: 'payer',
  amount: 12,
  billingAccountId: 'original-wallet',
  description: 'Avatar generation',
  expiresAt: new Date(0),
  id: 'hold',
  isDeleted: false,
  metadata: HEYGEN,
  organizationId: 'org',
  source: ActivitySource.VIDEO_GENERATION,
  status: CreditReservationStatus.RESERVED,
  workloadId: 'asset',
  workloadType: 'media-generation',
  ...fields,
});
const manyHolds = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeHold({ id: `hold-${String(index).padStart(3, '0')}` }),
  );
const heygen = (data: Row | null): Observable<unknown> =>
  of({ data: { data } });

const scalarMatch = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

describe('media hold provider and operator recovery', () => {
  // Stored rows and the provider's answer.
  let holds: Row[];
  let ingredient: Row | null;
  let crunTasks: Row[];
  let providerResponse: () => Observable<unknown>;
  let tenantKey: string | undefined;
  let hostedKey: string;
  let onPoll: () => void;
  // Effects: provider requests, committed ledger moves and audits, and what
  // ran after the commit.
  let requests: [string, Row][];
  let timeline: string[];
  let settlements: Row[];
  let releases: Row[];
  let audits: Row[];
  let invalidated: string[];
  let topUps: Row[];
  let warnings: [string, Row][];
  let errors: [string, Row][];
  let auditFailure: Error | undefined;
  let isCrunLookupDown: boolean;
  let service: GenerationHoldRecoveryService;

  const hold = () => holds.find((row) => row.id === 'hold') as Row;
  const apply = (fields: Partial<CreditHoldRecoveryInput> = {}) =>
    service.apply({
      action: CreditHoldRecoveryAction.CHARGE,
      organizationId: 'org',
      reason: 'Operator reviewed provider',
      reservationId: 'hold',
      ...fields,
    });

  beforeEach(() => {
    holds = [makeHold()];
    ingredient = {
      generationProvider: null,
      id: 'asset',
      isDeleted: false,
      metadata: { externalId: 'stored-provider-job' },
      organizationId: 'org',
      status: IngredientStatus.PROCESSING,
      userId: 'ingredient-owner',
    };
    crunTasks = [];
    providerResponse = () => heygen({ status: 'completed' });
    tenantKey = 'tenant-key';
    hostedKey = 'hosted-key';
    onPoll = () => undefined;
    requests = [];
    timeline = [];
    settlements = [];
    releases = [];
    audits = [];
    invalidated = [];
    topUps = [];
    warnings = [];
    errors = [];
    auditFailure = undefined;
    isCrunLookupDown = false;

    const prisma = {
      creditReservation: {
        // Reads return a snapshot, as Postgres rows do.
        findFirst: async ({ where }: { where: Row }) =>
          structuredClone(holds.find((row) => scalarMatch(row, where)) ?? null),
        findMany: async ({
          take,
          where,
        }: {
          take: number;
          where: {
            expiresAt: { lte: Date };
            id?: { gt: string };
            organizationId: string;
            status: { in: string[] };
            workloadType: string;
          };
        }) =>
          holds
            .filter(
              (row) =>
                row.organizationId === where.organizationId &&
                row.isDeleted === false &&
                row.workloadType === where.workloadType &&
                (row.expiresAt as Date) <= where.expiresAt.lte &&
                where.status.in.includes(row.status as string) &&
                (!where.id || (row.id as string) > where.id.gt),
            )
            .sort((left, right) =>
              String(left.id).localeCompare(String(right.id)),
            )
            .slice(0, take),
      },
      crunGenerationTask: {
        findFirst: async ({
          where,
        }: {
          where: { OR: Row[]; organizationId: string };
        }) => {
          if (isCrunLookupDown) throw new Error('private database diagnostics');
          return (
            crunTasks.find(
              (task) =>
                task.organizationId === where.organizationId &&
                where.OR.some((clause) => scalarMatch(task, clause)),
            ) ?? null
          );
        },
      },
      ingredient: {
        findFirst: async ({ where }: { where: Row }) =>
          ingredient && scalarMatch(ingredient, where) ? ingredient : null,
      },
    };
    const holdFor = (input: Row) => {
      const row = holds.find(
        (candidate) =>
          candidate.id === input.reservationId &&
          candidate.organizationId === input.organizationId,
      ) as Row;
      if (
        input.expectedReservationMetadata &&
        JSON.stringify(row.metadata) !==
          JSON.stringify(input.expectedReservationMetadata)
      ) {
        throw new Error('Reservation metadata changed');
      }
      return row;
    };
    // One serializable transaction: every write inside rolls back on a throw.
    const reservations = {
      releaseInTransaction: async (input: Row) => {
        Object.assign(holdFor(input), {
          status: CreditReservationStatus.RELEASED,
        });
        releases.push({
          reason: input.reason,
          reservationId: input.reservationId,
        });
        return { held: 0, settled: 100 };
      },
      runSerializable: async <T>(work: (tx: typeof prisma) => Promise<T>) => {
        timeline.push('transaction');
        const before = structuredClone({
          audits,
          holds,
          releases,
          settlements,
        });
        try {
          return await work(prisma);
        } catch (error: unknown) {
          ({ audits, holds, releases, settlements } = before);
          throw error;
        }
      },
      settleInTransaction: async (input: Row) => {
        Object.assign(holdFor(input), {
          status: CreditReservationStatus.SETTLED,
        });
        settlements.push(input);
        return { held: 0, settled: 88 };
      },
    };

    service = new GenerationHoldRecoveryService(
      prisma as unknown as PrismaService,
      reservations as unknown as CreditReservationService,
      {
        afterCommit: async (commit: string) => {
          timeline.push(`after-commit:${commit}`);
        },
        recordInTransaction: async (_tx: unknown, activity: Row) => {
          if (auditFailure) throw auditFailure;
          audits.push(activity);
          return { commit: `audit-${audits.length}` };
        },
      } as unknown as ActivityRecorderService,
      {
        resolveApiKey: async (organizationId: string, provider: string) =>
          organizationId === 'org' && provider === 'heygen' && tenantKey
            ? { apiKey: tenantKey }
            : undefined,
      } as unknown as ByokService,
      { getApiKey: () => hostedKey } as unknown as ApiKeyHelperService,
      {
        get: (url: string, options: Row) => {
          timeline.push('poll');
          requests.push([url, options]);
          onPoll();
          return providerResponse();
        },
      } as unknown as HttpService,
      {
        error: (message: string, context: Row) => {
          errors.push([message, context]);
        },
        warn: (message: string, context: Row) => {
          warnings.push([message, context]);
        },
      } as unknown as LoggerService,
      {
        invalidateForOrganization: async (organizationId: string) => {
          invalidated.push(organizationId);
        },
      } as unknown as AccessBootstrapCacheService,
      {
        queueDeduction: async (charge: Row) => {
          timeline.push('top-up');
          topUps.push(charge);
        },
      } as unknown as CreditDeductionQueueService,
    );
  });

  describe('per-second holds at the ceiling (#6932)', () => {
    beforeEach(() => {
      holds = [makeHold({ amount: 129, metadata: AVATAR_QUOTE })];
    });

    it.each([
      [
        'the clip length HeyGen reports',
        { duration: 5, status: 'completed' },
        undefined,
      ],
      ['the stored output duration', { status: 'completed' }, 5],
    ])('re-prices the charge at %s', async (_case, response, storedSeconds) => {
      providerResponse = () => heygen(response);
      Object.assign(ingredient as Row, {
        metadata: {
          duration: storedSeconds,
          externalId: 'stored-provider-job',
        },
      });

      await service.recoverAtCeiling('org', 'hold');

      expect(settlements).toEqual([
        expect.objectContaining({
          actualAmount: 65,
          metadata: {
            durationSettlement: expect.objectContaining({
              actualSeconds: 5,
              heldCredits: 129,
            }),
            recoveredReservationId: 'hold',
          },
          settlementIdempotencyKey: 'media-generation-late-settle:hold',
        }),
      ]);
      expect(topUps).toEqual([]);
    });

    it('settles the hold and tops up a capped overrun after the commit', async () => {
      providerResponse = () => heygen({ duration: 60, status: 'completed' });

      await service.recoverAtCeiling('org', 'hold');

      expect(settlements).toEqual([
        expect.objectContaining({ actualAmount: 129 }),
      ]);
      expect(topUps).toEqual([
        expect.objectContaining({
          amount: 129,
          idempotencyKey: 'media-generation-duration-topup:hold',
          organizationId: 'org',
          userId: 'payer',
        }),
      ]);
      expect(timeline.slice(-2)).toEqual(['after-commit:audit-1', 'top-up']);
      expect(errors).toEqual([
        [
          expect.stringContaining('per-render charge cap'),
          expect.objectContaining({ forgoneCredits: 271 }),
        ],
      ]);
    });
  });

  it('charges a hold with no frozen quote at its amount', async () => {
    providerResponse = () => heygen({ duration: 60, status: 'completed' });

    await service.recoverAtCeiling('org', 'hold');

    expect(settlements).toEqual([
      expect.objectContaining({ actualAmount: 12 }),
    ]);
    expect(topUps).toEqual([]);
  });

  it('polls only the stored org-owned identity, outside the financial transaction, and charges under the late key', async () => {
    await expect(service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.CHARGE,
    );

    expect(requests).toEqual([
      [
        'https://api.heygen.com/v3/videos/stored-provider-job',
        { headers: { 'X-Api-Key': 'tenant-key' }, timeout: 10_000 },
      ],
    ]);
    expect(timeline.slice(0, 2)).toEqual(['poll', 'transaction']);
    expect(settlements).toEqual([
      expect.objectContaining({
        actorUserId: 'payer',
        actualAmount: 12,
        expectedReservationMetadata: HEYGEN,
        settlementIdempotencyKey: 'media-generation-late-settle:hold',
        source: ActivitySource.VIDEO_GENERATION,
      }),
    ]);
    expect(hold().status).toBe(CreditReservationStatus.SETTLED);
    expect(releases).toEqual([]);
  });

  it.each(['failed', 'error'])(
    'releases a hold only when HeyGen confirms %s',
    async (status) => {
      providerResponse = () => heygen({ status });

      await expect(service.recoverAtCeiling('org', 'hold')).resolves.toBe(
        CreditHoldRecoveryAction.RELEASE,
      );

      expect(releases).toEqual([{ reason: 'expiry', reservationId: 'hold' }]);
      expect(hold().status).toBe(CreditReservationStatus.RELEASED);
      expect(settlements).toEqual([]);
    },
  );

  it.each([
    [
      'a transport error',
      () => throwError(() => new Error('timeout')),
      'tenant-key',
    ],
    ['a missing API key', () => heygen({ status: 'completed' }), undefined],
    ['a malformed body', () => of({ data: 'not-json-object' }), 'tenant-key'],
    ['missing data', () => heygen(null), 'tenant-key'],
    [
      'a still-processing status',
      () => heygen({ status: 'processing' }),
      'tenant-key',
    ],
  ])(
    'leaves the hold reserved for an operator on %s',
    async (_case, response, key) => {
      holds = [makeHold({ expiresAt: new Date(Date.now() - DAY - 3_600_000) })];
      providerResponse = response;
      tenantKey = key;
      hostedKey = '';

      await expect(
        service.recoverAtCeiling('org', 'hold'),
      ).resolves.toBeUndefined();

      expect(hold().status).toBe(CreditReservationStatus.RESERVED);
      expect(timeline).not.toContain('transaction');
      expect(warnings).toEqual([
        [
          expect.stringContaining('held for operator review'),
          expect.objectContaining({ reservationId: 'hold' }),
        ],
      ]);
    },
  );

  it('releases an unknown status with an audit entry after 7 days', async () => {
    holds = [makeHold({ expiresAt: new Date(Date.now() - 8 * DAY) })];
    providerResponse = () => throwError(() => new Error('timeout'));

    await expect(service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.RELEASE,
    );

    expect(hold().status).toBe(CreditReservationStatus.RELEASED);
    expect(audits).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          action: CreditHoldRecoveryAction.RELEASE,
          afterStatus: CreditReservationStatus.RELEASED,
          reason: 'Unknown provider status after 7d at credit-hold ceiling',
        }),
      }),
    ]);
  });

  it('charges a completed provider even past 7 days', async () => {
    holds = [makeHold({ expiresAt: new Date(Date.now() - 30 * DAY) })];

    await expect(service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.CHARGE,
    );
    expect(releases).toEqual([]);
  });

  it('does not guess a provider identity when the ingredient is missing', async () => {
    ingredient = null;

    await expect(service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.RELEASE,
    );
    expect(requests).toEqual([]);
    expect(hold().status).toBe(CreditReservationStatus.RELEASED);
  });

  it('rejects a changed external id rather than billing stale provider proof', async () => {
    onPoll = () => {
      Object.assign(ingredient as Row, { metadata: { externalId: 'new-job' } });
    };

    await expect(service.recoverAtCeiling('org', 'hold')).rejects.toThrow(
      'Provider identity changed',
    );
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
    expect(settlements).toEqual([]);
  });

  it.each([
    [
      'a Crun',
      {
        metadata: {
          assetId: 'asset',
          submissionIntent: { provider: 'crun', version: 1 },
        },
      },
    ],
    [
      'a versioned Crun',
      {
        metadata: {
          assetId: 'asset',
          submissionIntent: { provider: 'crun', version: 2 },
        },
      },
    ],
    ['a quote-group', { metadata: { ...HEYGEN, modelQuote: {} } }],
    ['a foreign-asset', { metadata: { ...HEYGEN, assetId: 'foreign' } }],
    ['a non-media', { workloadType: 'pool' }],
  ])('rejects %s hold before any recovery mutation', async (_case, fields) => {
    holds = [makeHold(fields)];

    await expect(apply({ operatorUserId: 'operator' })).rejects.toThrow(
      'provider or quote-group recovery',
    );
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
    expect(audits).toEqual([]);
  });

  it('allows a safe legacy per-output media hold with matching asset proof', async () => {
    holds = [makeHold({ metadata: { assetId: 'asset' } })];

    await apply({
      action: CreditHoldRecoveryAction.RELEASE,
      reason: 'Legacy provider failed',
    });

    expect(hold().status).toBe(CreditReservationStatus.RELEASED);
  });

  it('rejects a durable Crun task even when the intent names another provider', async () => {
    crunTasks = [
      {
        id: 'crun-task',
        ingredientId: 'asset',
        isDeleted: false,
        organizationId: 'org',
      },
    ];

    await expect(service.recoverAtCeiling('org', 'hold')).rejects.toThrow(
      'Crun',
    );
    expect(requests).toEqual([]);
  });

  it.each([
    [
      'a hold that has not reached its ceiling',
      { expiresAt: new Date(Date.now() + DAY) },
      IngredientStatus.PROCESSING,
      'not stuck yet',
    ],
    [
      'library proof of a completed output',
      {},
      IngredientStatus.GENERATED,
      'Completed output must be charged',
    ],
  ])('refuses to release %s', async (_case, fields, status, message) => {
    holds = [makeHold(fields)];
    Object.assign(ingredient as Row, { status });

    await expect(
      apply({ action: CreditHoldRecoveryAction.RELEASE }),
    ).rejects.toThrow(message);
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
  });

  it.each([
    ['an empty', '   '],
    ['a too-short', 'short'],
  ])('rejects %s recovery reason', async (_case, reason) => {
    await expect(apply({ reason })).rejects.toThrow(
      'between 8 and 500 characters',
    );
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
  });

  it('records the operator separately from the payer in the same financial transaction', async () => {
    await apply({
      operatorUserId: 'operator',
      reason: 'Verified completion in provider',
    });

    expect(audits).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          afterStatus: CreditReservationStatus.SETTLED,
          amount: 12,
          beforeStatus: CreditReservationStatus.RESERVED,
          billingAccountId: 'original-wallet',
          chargedAmount: 12,
          operatorUserId: 'operator',
          payerUserId: 'payer',
          reason: 'Verified completion in provider',
          wallet: { held: 0, settled: 88 },
        }),
        organizationId: 'org',
        userId: 'operator',
        value: JSON.stringify({
          description: 'Credit hold charge: Verified completion in provider',
          value: 0,
        }),
      }),
    ]);
    expect(timeline).toContain('after-commit:audit-1');
    expect(invalidated).toEqual(['org']);
  });

  it('rolls the charge back and dispatches nothing when the audit cannot be persisted', async () => {
    auditFailure = new Error('audit unavailable');

    await expect(apply({ reason: 'Verified completion' })).rejects.toThrow(
      'audit unavailable',
    );
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
    expect(settlements).toEqual([]);
    expect(timeline).toEqual(['transaction']);
    expect(invalidated).toEqual([]);
  });

  it('never reaches another organization’s hold', async () => {
    await expect(
      apply({ organizationId: 'other-org', reason: 'Verified completion' }),
    ).rejects.toThrow('Credit hold not found');
    expect(hold().status).toBe(CreditReservationStatus.RESERVED);
  });

  describe('list', () => {
    it('pages one organization’s stuck holds by cursor', async () => {
      holds = [
        ...manyHolds(51),
        makeHold({ id: 'hold-foreign', organizationId: 'org-2' }),
      ];

      const first = await service.list('org');
      const second = await service.list('org', first.nextCursor ?? undefined);

      expect([first.rows.length, first.nextCursor]).toEqual([50, 'hold-049']);
      expect(second.rows.map(({ id }) => id)).toEqual(['hold-050']);
      expect(second.nextCursor).toBeNull();
    });

    it.each([
      [
        'an eligible hold',
        [],
        { blockedReason: null, canCharge: true, canRelease: true },
      ],
      [
        'a hold with a durable Crun task',
        [
          {
            id: 'task',
            isDeleted: false,
            organizationId: 'org',
            reservationId: 'hold',
          },
        ],
        {
          blockedReason: 'Crun holds require Crun recovery',
          canCharge: false,
          canRelease: false,
        },
      ],
    ])('offers only the safe actions for %s', async (_case, tasks, actions) => {
      crunTasks = tasks;

      const report = await service.list('org');

      expect(report.rows).toEqual([
        expect.objectContaining({ id: 'hold', ...actions }),
      ]);
    });

    it('does not expose unexpected database errors as row eligibility messages', async () => {
      isCrunLookupDown = true;

      await expect(service.list('org')).rejects.toThrow(
        'private database diagnostics',
      );
    });
  });
});
