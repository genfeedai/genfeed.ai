vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import {
  listSocialWarmupJourneyChecks,
  SOCIAL_WARMUP_TELEMETRY_EVENT,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-journey.contract';
import type { LoggerService } from '@libs/logger/logger.service';

const NOW = new Date('2026-08-14T12:00:00.000Z');
const START = new Date('2026-08-08T10:00:00.000Z');
const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

type StoreRow = Record<string, unknown>;

function matches(
  row: StoreRow,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) {
    return true;
  }

  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const filter = value as { gte?: Date; in?: unknown[] };
      if (filter.in && !filter.in.includes(row[key])) {
        return false;
      }
      if (
        filter.gte &&
        (!(row[key] instanceof Date) || row[key] < filter.gte)
      ) {
        return false;
      }
      if (filter.in || filter.gte) {
        continue;
      }
    }
    if (row[key] !== value) {
      return false;
    }
  }

  return true;
}

function createMemoryPrisma() {
  const credentials: StoreRow[] = [];
  const enrollments: StoreRow[] = [];
  const events: StoreRow[] = [];
  const signals: StoreRow[] = [];
  const posts: StoreRow[] = [];
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  const api = {
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    credential: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          credentials.find((row) => matches(row, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        credentials.filter((row) => matches(row, where)),
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const row = credentials.find((candidate) =>
            matches(candidate, where),
          );
          if (!row) {
            throw new Error('credential not found');
          }
          Object.assign(row, data);
          return row;
        },
      ),
    },
    post: {
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          posts.filter((row) => matches(row, where)).length,
      ),
    },
    socialWarmupEnrollment: {
      count: vi.fn(
        async ({ where }: { where?: Record<string, unknown> }) =>
          enrollments.filter((row) => matches(row, where)).length,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Record<string, unknown> & {
            signals?: { create?: StoreRow[] };
          };
        }) => {
          const row: StoreRow = {
            createdAt: new Date(),
            currentPhaseId: data.currentPhaseId,
            events: [],
            id: nextId('enrollment'),
            isDeleted: false,
            updatedAt: new Date(),
            ...data,
            signals: [],
          };
          delete row.signals;
          enrollments.push(row);
          for (const signal of data.signals?.create ?? []) {
            signals.push({
              ...signal,
              brandId: row.brandId,
              enrollmentId: row.id,
              id: nextId('signal'),
              isDeleted: false,
              organizationId: row.organizationId,
            });
          }
          return {
            ...row,
            events: [],
            signals: signals.filter(
              (signal) => signal.enrollmentId === row.id && !signal.isDeleted,
            ),
          };
        },
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const row = enrollments.find((candidate) =>
            matches(candidate, where),
          );
          if (!row) {
            return null;
          }
          return {
            ...row,
            events: events
              .filter(
                (event) => event.enrollmentId === row.id && !event.isDeleted,
              )
              .sort(
                (left, right) =>
                  (left.occurredAt as Date).getTime() -
                  (right.occurredAt as Date).getTime(),
              ),
            signals: signals.filter(
              (signal) => signal.enrollmentId === row.id && !signal.isDeleted,
            ),
          };
        },
      ),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        enrollments
          .filter((row) => matches(row, where))
          .map((row) => ({
            ...row,
            events: events.filter((event) => event.enrollmentId === row.id),
            signals: signals.filter((signal) => signal.enrollmentId === row.id),
          })),
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const row = enrollments.find((candidate) =>
            matches(candidate, where),
          );
          if (!row) {
            throw new Error('enrollment not found');
          }
          Object.assign(row, data, { updatedAt: new Date() });
          return {
            ...row,
            events: events.filter((event) => event.enrollmentId === row.id),
            signals: signals.filter((signal) => signal.enrollmentId === row.id),
          };
        },
      ),
    },
    socialWarmupEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: nextId('event'),
          isDeleted: false,
          occurredAt: data.occurredAt ?? new Date(),
        };
        events.push(row);
        return row;
      }),
    },
    socialWarmupSignal: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: nextId('signal'),
          isDeleted: false,
        };
        signals.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          signals.find((row) => matches(row, where) && !row.isDeleted) ?? null,
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const row = signals.find((candidate) => matches(candidate, where));
          if (!row) {
            throw new Error('signal not found');
          }
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const matched = signals.filter((row) => matches(row, where));
          for (const row of matched) {
            Object.assign(row, data);
          }
          return { count: matched.length };
        },
      ),
    },
  };

  return {
    api,
    credentials,
    enrollments,
    events,
    posts,
    signals,
  };
}

function seedCredential(
  store: ReturnType<typeof createMemoryPrisma>,
  overrides: StoreRow = {},
) {
  const row: StoreRow = {
    brandId: 'brand-1',
    createdAt: START,
    externalAvatar: 'https://cdn.example/avatar.png',
    externalHandle: '@studio',
    externalName: 'Studio TikTok',
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    label: 'Studio TikTok',
    organizationId: 'org-1',
    platform: CredentialPlatform.TIKTOK,
    warmupAssessedAt: null,
    warmupHoldReason: null,
    warmupManualOverride: false,
    warmupOverrideConfirmedAt: null,
    warmupOverrideConfirmedByUserId: null,
    warmupOverrideReason: null,
    warmupOverrideUntil: null,
    warmupRiskLevel: 'unknown',
    warmupScore: 0,
    warmupSignals: {},
    warmupState: 'not_started',
    warmupThresholds: {},
    ...overrides,
  };
  store.credentials.push(row);
  return row;
}

describe('social warm-up graduation and publishing-gate journey (#2217)', () => {
  let store: ReturnType<typeof createMemoryPrisma>;
  let enrollments: SocialWarmupEnrollmentsService;
  let health: AccountHealthService;
  let logger: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    store = createMemoryPrisma();
    logger = { log: vi.fn() };
    enrollments = new SocialWarmupEnrollmentsService(
      store.api as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
    health = new AccountHealthService(
      store.api as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function completeRequiredJourney(enrollmentId: string) {
    const checks = listSocialWarmupJourneyChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
    );
    for (const check of checks) {
      if (check.requirement === 'optional') {
        continue;
      }
      if (check.provenance === 'user_confirmed') {
        await enrollments.completeItemScoped(
          enrollmentId,
          check.id,
          { provenance: 'user_confirmed' },
          context,
        );
        continue;
      }

      await enrollments.upsertSignalScoped(
        enrollmentId,
        {
          evidence: { outcome: 'available' },
          key: check.completionKey,
          observedAt: NOW.toISOString(),
          source:
            check.provenance === 'genfeed_observed'
              ? SocialWarmupSignalSource.GENFEED
              : SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
        context,
      );
    }
  }

  it('walks connect → enroll → check-ins → refresh → first upload → assessment → graduated', async () => {
    seedCredential(store);
    const enrolled = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );

    expect(enrolled.blueprintId).toBe(TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID);
    expect(enrolled.blueprintVersion).toBe(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
    );
    expect(enrolled.state).toBe(SocialWarmupEnrollmentState.ENROLLED);
    expect(logger.log).toHaveBeenCalledWith(
      SOCIAL_WARMUP_TELEMETRY_EVENT.enrolled,
      expect.objectContaining({
        credentialId: 'credential-1',
        enrollmentId: enrolled.id,
        platform: CredentialPlatform.TIKTOK,
      }),
    );

    vi.setSystemTime(NOW);
    store.posts.push(
      {
        credentialId: 'credential-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        credentialId: 'credential-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
    );

    await completeRequiredJourney(enrolled.id);
    await enrollments.upsertSignalScoped(
      enrolled.id,
      {
        evidence: { createdAt: '2026-07-01T00:00:00.000Z' },
        key: 'native-account-age',
        observedAt: NOW.toISOString(),
        source: SocialWarmupSignalSource.PLATFORM,
        status: SocialWarmupSignalStatus.AVAILABLE,
      },
      context,
    );
    const graduated = await enrollments.findOneScoped(enrolled.id, context);

    expect(graduated.state).toBe(SocialWarmupEnrollmentState.GRADUATED);
    expect(logger.log).toHaveBeenCalledWith(
      SOCIAL_WARMUP_TELEMETRY_EVENT.graduated,
      expect.objectContaining({ enrollmentId: enrolled.id }),
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /token|secret|password/i,
    );

    const summary = await health.assessCredentialHealth({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(summary.state).toBe('healthy');
    expect(summary.holdPublishing).toBe(false);
  });

  it('holds scheduled publishing for incomplete required checks with an actionable reason', async () => {
    seedCredential(store);
    await enrollments.enrollScoped({ credentialId: 'credential-1' }, context);

    const gate = await health.evaluateScheduledPublishGate({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(gate.holdPublishing).toBe(true);
    expect(gate.reason).toMatch(/required warm-up checks are incomplete/i);
    expect(gate.reason).toMatch(/Use TikTok manually/i);
    expect(gate.reason).toMatch(/does not guarantee reach or safety/i);
    expect(logger.log).toHaveBeenCalledWith(
      SOCIAL_WARMUP_TELEMETRY_EVENT.publishingHold,
      expect.objectContaining({
        credentialId: 'credential-1',
        holdReason: gate.reason,
      }),
    );
  });

  it('releases the hold with an expiring override without rewriting evidence', async () => {
    seedCredential(store);
    const enrolled = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );
    await enrollments.completeItemScoped(
      enrolled.id,
      'use-native-app-manually',
      {},
      context,
    );
    await enrollments.upsertSignalScoped(
      enrolled.id,
      {
        evidence: { username: 'studio' },
        key: 'profile-completeness-signal',
        observedAt: START.toISOString(),
        source: SocialWarmupSignalSource.PLATFORM,
        status: SocialWarmupSignalStatus.AVAILABLE,
      },
      context,
    );

    const eventsBefore = store.events.map((event) => ({ ...event }));
    const signalsBefore = store.signals.map((signal) => ({ ...signal }));

    const summary = await health.confirmManualOverride({
      credentialId: 'credential-1',
      organizationId: 'org-1',
      request: {
        confirm: true,
        expiresAt: '2026-08-09T10:00:00.000Z',
        reason: 'Operator reviewed native-app-only remaining steps.',
      },
      userId: 'user-1',
    });

    expect(summary.override.isActive).toBe(true);
    expect(summary.holdPublishing).toBe(false);
    expect(store.events).toEqual(eventsBefore);
    expect(store.signals).toEqual(signalsBefore);
    expect(logger.log).toHaveBeenCalledWith(
      SOCIAL_WARMUP_TELEMETRY_EVENT.override,
      expect.objectContaining({
        credentialId: 'credential-1',
        reason: 'Operator reviewed native-app-only remaining steps.',
      }),
    );

    vi.setSystemTime(new Date('2026-08-09T11:00:00.000Z'));
    const expired = await health.evaluateScheduledPublishGate({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(expired.holdPublishing).toBe(true);
    expect(expired.summary.override.isActive).toBe(false);
    expect(store.events).toEqual(eventsBefore);
  });

  it('covers partial scopes, revoked tokens, stale signals, reconnect, retry, and native-app-only provenance', async () => {
    seedCredential(store, {
      id: 'credential-1',
      warmupSignals: {
        tiktokAuthorized: {
          grantedScopes: ['user.info.basic'],
          state: 'partial',
        },
      },
    });

    const enrolled = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );
    expect(enrolled.hasPartialScopes).toBe(true);
    expect(enrolled.reconnect).toMatchObject({ reason: 'partial_scopes' });

    const retried = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );
    expect(retried.id).toBe(enrolled.id);
    expect(
      store.enrollments.filter((row) => row.credentialId === 'credential-1'),
    ).toHaveLength(1);

    await enrollments.completeItemScoped(
      enrolled.id,
      'use-native-app-manually',
      { provenance: 'user_confirmed' },
      context,
    );
    expect(store.events.at(-1)).toMatchObject({
      action: SocialWarmupEventAction.COMPLETED,
      itemId: 'use-native-app-manually',
      provenance: 'user_confirmed',
    });

    await enrollments.upsertSignalScoped(
      enrolled.id,
      {
        evidence: { username: 'studio' },
        key: 'profile-completeness-signal',
        observedAt: START.toISOString(),
        source: SocialWarmupSignalSource.PLATFORM,
        status: SocialWarmupSignalStatus.STALE,
      },
      context,
    );
    await enrollments.upsertSignalScoped(
      enrolled.id,
      {
        evidence: { reason: 'revoked' },
        key: 'first-upload-platform-signal',
        observedAt: START.toISOString(),
        source: SocialWarmupSignalSource.PLATFORM,
        status: SocialWarmupSignalStatus.REVOKED,
      },
      context,
    );

    const credential = store.credentials[0];
    if (!credential) {
      throw new Error('expected credential');
    }
    credential.isConnected = false;
    const disconnected = await enrollments.findOneScoped(enrolled.id, context);
    expect(disconnected.state).toBe(SocialWarmupEnrollmentState.DISCONNECTED);
    expect(disconnected.reconnect).toMatchObject({ reason: 'disconnected' });
    expect(
      disconnected.signals.every(
        (signal) =>
          signal.source !== SocialWarmupSignalSource.PLATFORM ||
          signal.status === SocialWarmupSignalStatus.STALE,
      ),
    ).toBe(true);
    expect(disconnected.completedItemIds).toContain('use-native-app-manually');

    credential.isConnected = true;
    const reconnected = await enrollments.findOneScoped(enrolled.id, context);
    expect(reconnected.state).not.toBe(
      SocialWarmupEnrollmentState.DISCONNECTED,
    );
    expect(reconnected.completedItemIds).toContain('use-native-app-manually');
  });

  it('keeps a sibling credential intact when one refresh fails', async () => {
    seedCredential(store, { id: 'credential-1' });
    seedCredential(store, {
      id: 'credential-2',
      externalHandle: '@sibling',
    });

    const first = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );
    const sibling = await enrollments.enrollScoped(
      { credentialId: 'credential-2' },
      context,
    );
    await enrollments.completeItemScoped(
      sibling.id,
      'watch-niche-content',
      {},
      context,
    );

    await enrollments.syncTikTokAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot: {
        credentialId: 'credential-1',
        evidence: [
          {
            fieldAvailability: { id: 'failed' },
            key: 'profile-completeness-signal',
            observedAt: START.toISOString(),
            provenance: 'platform_verified',
            scope: { granted: [], missing: [], required: [] },
            staleAt: null,
            status: 'failed',
          },
        ],
        grantedScopes: [],
        platform: CredentialPlatform.TIKTOK,
        refreshAttemptedAt: START.toISOString(),
        state: 'failed',
      } as never,
    });

    const siblingAfter = await enrollments.findOneScoped(sibling.id, context);
    expect(siblingAfter.completedItemIds).toEqual(['watch-niche-content']);
    expect(
      siblingAfter.signals.some(
        (signal) => signal.key === 'profile-completeness-signal',
      ),
    ).toBe(false);
    const failed = await enrollments.findOneScoped(first.id, context);
    expect(
      failed.signals.some(
        (signal) =>
          signal.key === 'profile-completeness-signal' &&
          signal.status === SocialWarmupSignalStatus.FAILED,
      ),
    ).toBe(true);
  });

  it('keeps publishing held after a publish failure even with an otherwise warm account', async () => {
    seedCredential(store, {
      externalAvatar: 'https://cdn.example/a.png',
      externalHandle: '@studio',
      externalName: 'Studio',
      label: 'Studio',
    });
    const enrolled = await enrollments.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );
    vi.setSystemTime(NOW);
    store.posts.push(
      {
        createdAt: NOW,
        credentialId: 'credential-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        createdAt: NOW,
        credentialId: 'credential-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        createdAt: NOW,
        credentialId: 'credential-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.FAILED,
      },
    );
    await completeRequiredJourney(enrolled.id);
    await enrollments.upsertSignalScoped(
      enrolled.id,
      {
        evidence: { createdAt: '2026-07-01T00:00:00.000Z' },
        key: 'native-account-age',
        observedAt: NOW.toISOString(),
        source: SocialWarmupSignalSource.PLATFORM,
        status: SocialWarmupSignalStatus.AVAILABLE,
      },
      context,
    );

    const gate = await health.evaluateScheduledPublishGate({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(gate.summary.state).toBe('risky');
    expect(gate.holdPublishing).toBe(true);
    expect(gate.reason).toMatch(/risky/i);
  });
});
