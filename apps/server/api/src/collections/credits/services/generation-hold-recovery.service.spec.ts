import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import {
  ActivitySource,
  CreditHoldRecoveryAction,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  usesMeteredCredits: () => true,
}));

function fixture() {
  const hold = {
    id: 'hold',
    amount: 12,
    organizationId: 'org',
    actorUserId: 'payer',
    billingAccountId: 'original-wallet',
    status: CreditReservationStatus.RESERVED,
    workloadType: 'media-generation',
    workloadId: 'asset',
    metadata: {
      assetId: 'asset',
      submissionIntent: { version: 1, provider: 'heygen' },
    },
    expiresAt: new Date(0),
    description: 'Avatar generation',
    source: ActivitySource.VIDEO_GENERATION,
  };
  const ingredient = {
    id: 'asset',
    status: IngredientStatus.PROCESSING,
    metadata: { externalId: 'stored-provider-job' },
  };
  const prisma = {
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue(hold),
      findMany: vi.fn().mockResolvedValue([hold]),
    },
    ingredient: { findFirst: vi.fn().mockResolvedValue(ingredient) },
    crunGenerationTask: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const reservations = {
    runSerializable: vi.fn(async (fn) => fn(prisma)),
    settleInTransaction: vi.fn().mockResolvedValue({ held: 0, settled: 88 }),
    releaseInTransaction: vi.fn().mockResolvedValue({ held: 0, settled: 100 }),
  };
  const activities = {
    recordInTransaction: vi.fn().mockResolvedValue({ commit: {} }),
    afterCommit: vi.fn(),
  };
  const byok = {
    resolveApiKey: vi.fn().mockResolvedValue({ apiKey: 'tenant-key' }),
  };
  const apiKeys = { getApiKey: vi.fn().mockReturnValue('hosted-key') };
  const http = {
    get: vi
      .fn()
      .mockReturnValue(of({ data: { data: { status: 'completed' } } })),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const bootstrapCache = { invalidateForOrganization: vi.fn() };
  const service = new GenerationHoldRecoveryService(
    prisma as never,
    reservations as never,
    activities as never,
    byok as never,
    apiKeys as never,
    http as never,
    logger as never,
    bootstrapCache as never,
  );
  return {
    service,
    hold,
    ingredient,
    prisma,
    reservations,
    activities,
    bootstrapCache,
    byok,
    apiKeys,
    http,
    logger,
  };
}

describe('media hold provider and operator recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('polls only a stored org-owned identity, outside the financial transaction, and charges using the late key', async () => {
    const f = fixture();
    await f.service.recoverAtCeiling('org', 'hold');
    expect(f.prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset', organizationId: 'org', isDeleted: false },
      }),
    );
    expect(f.byok.resolveApiKey).toHaveBeenCalledWith('org', 'heygen');
    expect(f.http.get).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/videos/stored-provider-job',
      {
        headers: { 'X-Api-Key': 'tenant-key' },
        timeout: 10000,
      },
    );
    expect(f.http.get.mock.invocationCallOrder[0]).toBeLessThan(
      f.reservations.runSerializable.mock.invocationCallOrder[0],
    );
    expect(f.reservations.settleInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 12,
        actorUserId: 'payer',
        source: ActivitySource.VIDEO_GENERATION,
        settlementIdempotencyKey: 'media-generation-late-settle:hold',
        expectedReservationMetadata: f.hold.metadata,
      }),
      f.prisma,
      true,
    );
    expect(f.reservations.releaseInTransaction).not.toHaveBeenCalled();
  });

  it.each(['failed', 'error'])(
    'releases a hold only when HeyGen confirms %s',
    async (status) => {
      const f = fixture();
      f.http.get.mockReturnValue(of({ data: { data: { status } } }));
      await expect(f.service.recoverAtCeiling('org', 'hold')).resolves.toBe(
        CreditHoldRecoveryAction.RELEASE,
      );
      expect(f.reservations.releaseInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'expiry',
          expectedReservationMetadata: f.hold.metadata,
        }),
        f.prisma,
      );
      expect(f.reservations.settleInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'a transport error',
      (f: ReturnType<typeof fixture>) =>
        f.http.get.mockReturnValue(throwError(() => new Error('timeout'))),
    ],
    [
      'a missing API key',
      (f: ReturnType<typeof fixture>) => {
        f.byok.resolveApiKey.mockResolvedValue(undefined);
        f.apiKeys.getApiKey.mockReturnValue('');
      },
    ],
    [
      'a malformed body',
      (f: ReturnType<typeof fixture>) =>
        f.http.get.mockReturnValue(of({ data: 'not-json-object' })),
    ],
    [
      'missing data',
      (f: ReturnType<typeof fixture>) =>
        f.http.get.mockReturnValue(of({ data: { data: null } })),
    ],
    [
      'a still-processing status',
      (f: ReturnType<typeof fixture>) =>
        f.http.get.mockReturnValue(
          of({ data: { data: { status: 'processing' } } }),
        ),
    ],
  ])(
    'leaves the hold reserved and neither releases nor charges on %s',
    async (_name, arrange) => {
      const f = fixture();
      f.hold.expiresAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      arrange(f);
      await expect(
        f.service.recoverAtCeiling('org', 'hold'),
      ).resolves.toBeUndefined();
      expect(f.reservations.releaseInTransaction).not.toHaveBeenCalled();
      expect(f.reservations.settleInTransaction).not.toHaveBeenCalled();
      expect(f.reservations.runSerializable).not.toHaveBeenCalled();
      expect(f.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('held for operator review'),
        expect.objectContaining({ reservationId: 'hold' }),
      );
    },
  );

  it('releases an unknown status with an audit entry after 7 days', async () => {
    const f = fixture();
    f.hold.expiresAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    f.http.get.mockReturnValue(throwError(() => new Error('timeout')));
    await expect(f.service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.RELEASE,
    );
    expect(f.reservations.releaseInTransaction).toHaveBeenCalledTimes(1);
    expect(f.activities.recordInTransaction).toHaveBeenCalledWith(
      f.prisma,
      expect.objectContaining({
        data: expect.objectContaining({
          action: CreditHoldRecoveryAction.RELEASE,
          reason: 'Unknown provider status after 7d at credit-hold ceiling',
        }),
      }),
    );
  });

  it('charges a completed provider even past 7 days', async () => {
    const f = fixture();
    f.hold.expiresAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await expect(f.service.recoverAtCeiling('org', 'hold')).resolves.toBe(
      CreditHoldRecoveryAction.CHARGE,
    );
    expect(f.reservations.releaseInTransaction).not.toHaveBeenCalled();
  });

  it('does not guess a provider identity when the ingredient is deleted or missing', async () => {
    const f = fixture();
    f.prisma.ingredient.findFirst.mockResolvedValue(null);
    await f.service.recoverAtCeiling('org', 'hold');
    expect(f.http.get).not.toHaveBeenCalled();
    expect(f.reservations.releaseInTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed external id rather than billing stale provider proof', async () => {
    const f = fixture();
    f.http.get.mockImplementation(() => {
      f.ingredient.metadata.externalId = 'new-job';
      return of({ data: { data: { status: 'completed' } } });
    });
    await expect(f.service.recoverAtCeiling('org', 'hold')).rejects.toThrow(
      'Provider identity changed',
    );
    expect(f.reservations.settleInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    'crun',
    'crun-version',
    'quote-group',
    'foreign-asset',
    'non-media',
  ])('rejects %s holds before any recovery mutation', async (kind) => {
    const f = fixture();
    if (kind === 'crun-version') {
      f.hold.metadata.submissionIntent.provider = 'crun';
      f.hold.metadata.submissionIntent.version = 2;
    }
    if (kind === 'crun') f.hold.metadata.submissionIntent.provider = 'crun';
    if (kind === 'quote-group')
      Object.assign(f.hold.metadata, { modelQuote: {} });
    if (kind === 'foreign-asset') f.hold.metadata.assetId = 'foreign';
    if (kind === 'non-media') f.hold.workloadType = 'pool';
    await expect(
      f.service.apply({
        organizationId: 'org',
        reservationId: 'hold',
        action: CreditHoldRecoveryAction.CHARGE,
        reason: 'Operator reviewed provider',
        operatorUserId: 'operator',
      }),
    ).rejects.toThrow('provider or quote-group recovery');
    expect(f.reservations.settleInTransaction).not.toHaveBeenCalled();
    expect(f.activities.recordInTransaction).not.toHaveBeenCalled();
  });

  it('allows safe legacy per-output media holds with matching asset proof', async () => {
    const f = fixture();
    Object.assign(f.hold, { metadata: { assetId: 'asset' } });
    await f.service.apply({
      organizationId: 'org',
      reservationId: 'hold',
      action: CreditHoldRecoveryAction.RELEASE,
      reason: 'Legacy provider failed',
    });
    expect(f.reservations.releaseInTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects durable Crun tasks even if the intent claims another provider', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findFirst.mockResolvedValue({
      id: 'crun-task',
    });
    await expect(f.service.recoverAtCeiling('org', 'hold')).rejects.toThrow(
      'Crun',
    );
    expect(f.http.get).not.toHaveBeenCalled();
  });

  it('does not release library proof of a completed output', async () => {
    const f = fixture();
    f.ingredient.status = IngredientStatus.GENERATED;
    await expect(
      f.service.apply({
        organizationId: 'org',
        reservationId: 'hold',
        action: CreditHoldRecoveryAction.RELEASE,
        reason: 'Operator reviewed provider',
      }),
    ).rejects.toThrow('Completed output must be charged');
    expect(f.reservations.releaseInTransaction).not.toHaveBeenCalled();
  });

  it('records operator identity separately from the payer using the very same financial transaction', async () => {
    const f = fixture();
    await f.service.apply({
      organizationId: 'org',
      reservationId: 'hold',
      action: CreditHoldRecoveryAction.CHARGE,
      reason: 'Verified completion in provider',
      operatorUserId: 'operator',
    });
    expect(f.activities.recordInTransaction).toHaveBeenCalledWith(
      f.prisma,
      expect.objectContaining({
        userId: 'operator',
        organizationId: 'org',
        data: expect.objectContaining({
          operatorUserId: 'operator',
          payerUserId: 'payer',
          billingAccountId: 'original-wallet',
          amount: 12,
          reason: 'Verified completion in provider',
        }),
      }),
    );
    expect(f.activities.afterCommit).toHaveBeenCalledTimes(1);
    expect(f.bootstrapCache.invalidateForOrganization).toHaveBeenCalledWith(
      'org',
    );
    expect(
      JSON.parse(f.activities.recordInTransaction.mock.calls[0][1].value),
    ).toEqual({
      description: 'Credit hold charge: Verified completion in provider',
      value: 0,
    });
  });

  it('never dispatches audit afterCommit when audit persistence fails', async () => {
    const f = fixture();
    f.activities.recordInTransaction.mockRejectedValue(
      new Error('audit unavailable'),
    );
    await expect(
      f.service.apply({
        organizationId: 'org',
        reservationId: 'hold',
        action: CreditHoldRecoveryAction.CHARGE,
        reason: 'Verified completion',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(f.activities.afterCommit).not.toHaveBeenCalled();
    expect(f.bootstrapCache.invalidateForOrganization).not.toHaveBeenCalled();
  });

  it('does not expose unexpected database errors as row eligibility messages', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findFirst.mockRejectedValue(
      new Error('private database diagnostics'),
    );
    await expect(f.service.list('org')).rejects.toThrow(
      'private database diagnostics',
    );
  });

  it('scopes missing holds to the requested org without exposing or mutating foreign rows', async () => {
    const f = fixture();
    f.prisma.creditReservation.findFirst.mockResolvedValue(null);
    await expect(
      f.service.apply({
        organizationId: 'other-org',
        reservationId: 'hold',
        action: CreditHoldRecoveryAction.CHARGE,
        reason: 'Verified completion',
      }),
    ).rejects.toThrow('Credit hold not found');
    expect(f.prisma.creditReservation.findFirst).toHaveBeenCalledWith({
      where: { id: 'hold', organizationId: 'other-org', isDeleted: false },
    });
    expect(f.reservations.settleInTransaction).not.toHaveBeenCalled();
  });

  it('lists a bounded cursor page scoped to one org and hides unsafe actions', async () => {
    const f = fixture();
    const report = await f.service.list('org', 'previous');
    expect(f.prisma.creditReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          id: { gt: 'previous' },
        }),
      }),
    );
    expect(report.rows[0]).toEqual(
      expect.objectContaining({ canRelease: true, canCharge: true }),
    );
    f.prisma.crunGenerationTask.findFirst.mockResolvedValue({ id: 'task' });
    expect((await f.service.list('org')).rows[0]).toEqual(
      expect.objectContaining({ canRelease: false, canCharge: false }),
    );
  });
});
