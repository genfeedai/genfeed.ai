import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import type { QuotaCheckResult } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';

const ORGANIZATION_ID = 'org-1';

const HEALTHY_ENV: Record<string, string> = {
  GENFEEDAI_API_PUBLIC_URL: 'https://api.example.com',
  GENFEEDAI_APP_URL: 'https://app.example.com',
  TWITTER_CLIENT_ID: 'twitter-app-identifier',
  TWITTER_CLIENT_SECRET: 'twitter-app-secret-value',
  TWITTER_REDIRECT_URI: 'https://app.example.com/oauth/twitter',
};

function buildCredential(): CredentialDocument {
  return {
    accessToken: 'encrypted-access',
    accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
    id: 'cred-1',
    isConnected: true,
    platform: CredentialPlatform.TWITTER,
  } as unknown as CredentialDocument;
}

/** One connected credential row as the batch resolver selects it. */
function buildRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    accessToken: 'encrypted-access',
    accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
    accessTokenSecret: 'encrypted-secret',
    id: 'cred-1',
    isConnected: true,
    grantedScopes: [],
    grantedScopesCapturedAt: null,
    oauthToken: null,
    oauthTokenSecret: null,
    platform: CredentialPlatform.TWITTER,
    refreshToken: null,
    refreshTokenExpiry: null,
    ...overrides,
  };
}

describe('CredentialPublishingReadinessService', () => {
  let getQuotaStatus: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;

  function build(): CredentialPublishingReadinessService {
    return new CredentialPublishingReadinessService(
      new PublishingProviderSetupService({
        get: (key: string) => HEALTHY_ENV[key],
      } as unknown as ConfigService),
      { get: () => ({ getQuotaStatus }) } as never,
      { credential: { findMany } } as never,
    );
  }

  function resolveWithQuota(
    quota: QuotaCheckResult | null,
  ): ReturnType<CredentialPublishingReadinessService['resolve']> {
    getQuotaStatus.mockResolvedValue(quota);

    return build().resolve({
      credential: buildCredential(),
      organizationId: ORGANIZATION_ID,
      platform: CredentialPlatform.TWITTER,
    });
  }

  beforeEach(() => {
    vi.stubEnv('GENFEED_CLOUD', '');
    getQuotaStatus = vi.fn().mockResolvedValue(null);
    findMany = vi.fn().mockResolvedValue([buildRow()]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves quota unknown when the platform is unmetered', async () => {
    const readiness = await resolveWithQuota(null);

    expect(readiness).toMatchObject({
      canSchedule: true,
      quotaStatus: 'unknown',
      state: 'publish_capable',
    });
    expect(readiness.diagnostics.some((entry) => entry.scope === 'quota')).toBe(
      false,
    );
  });

  it('distinguishes an unlimited platform from an unmetered one', async () => {
    // A zero daily limit means "no quota configured", not "quota exhausted".
    const readiness = await resolveWithQuota({
      allowed: false,
      currentCount: 0,
      dailyLimit: 0,
      platform: CredentialPlatform.TWITTER,
    });

    expect(readiness.quotaStatus).toBe('unknown');
    expect(readiness.state).toBe('publish_capable');
  });

  it('passes quota well below the daily limit', async () => {
    const readiness = await resolveWithQuota({
      allowed: true,
      currentCount: 3,
      dailyLimit: 10,
      platform: CredentialPlatform.TWITTER,
    });

    expect(readiness.quotaStatus).toBe('pass');
    expect(readiness.state).toBe('publish_capable');
  });

  it('warns once the account crosses the quota warning ratio', async () => {
    const readiness = await resolveWithQuota({
      allowed: true,
      currentCount: 8,
      dailyLimit: 10,
      platform: CredentialPlatform.TWITTER,
    });

    expect(readiness).toMatchObject({
      canSchedule: true,
      quotaStatus: 'warn',
      state: 'degraded',
    });
    expect(
      readiness.diagnostics.find((entry) => entry.scope === 'quota'),
    ).toMatchObject({
      classification: 'quota_or_rate_limit',
      code: 'credential_daily_quota_nearly_exhausted',
      details: { currentCount: 8, dailyLimit: 10 },
      isRetryable: true,
      severity: 'warning',
    });
  });

  it('degrades rather than blocks an exhausted quota, because it resets', async () => {
    const readiness = await resolveWithQuota({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
      platform: CredentialPlatform.TWITTER,
    });

    expect(readiness).toMatchObject({
      // Scheduling for a future slot stays legal — the limit is per day.
      canSchedule: true,
      isRetryable: true,
      quotaStatus: 'fail',
      state: 'degraded',
    });
    expect(
      readiness.diagnostics.find((entry) => entry.scope === 'quota'),
    ).toMatchObject({
      code: 'credential_daily_quota_exhausted',
      severity: 'error',
    });
  });

  describe('resolveForCredentials', () => {
    it('scopes the batch read by organization and soft delete', async () => {
      const client = { credential: { findMany } };

      await build().resolveForCredentials(client as never, ORGANIZATION_ID, [
        'cred-1',
      ]);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['cred-1'] },
            isDeleted: false,
            organizationId: ORGANIZATION_ID,
          }),
        }),
      );
    });

    it('deduplicates credential ids and skips the query when none are given', async () => {
      const client = { credential: { findMany } };
      const service = build();

      await service.resolveForCredentials(client as never, ORGANIZATION_ID, [
        'cred-1',
        'cred-1',
      ]);
      expect(findMany.mock.calls[0]?.[0].where.id).toEqual({ in: ['cred-1'] });

      const empty = await service.resolveForCredentials(
        client as never,
        ORGANIZATION_ID,
        [],
      );
      expect(empty.size).toBe(0);
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('leaves quota unresolved rather than paying four queries per credential', async () => {
      const readiness = await build().resolveForCredentials(
        { credential: { findMany } } as never,
        ORGANIZATION_ID,
        ['cred-1'],
      );

      expect(readiness.get('cred-1')).toMatchObject({
        canSchedule: true,
        quotaStatus: 'unknown',
        state: 'publish_capable',
      });
      expect(getQuotaStatus).not.toHaveBeenCalled();
    });

    it('maps Prisma SCREAMING platforms onto domain provider keys', async () => {
      findMany.mockResolvedValue([buildRow({ platform: 'TWITTER' })]);

      const readiness = await build().resolveForCredentials(
        { credential: { findMany } } as never,
        ORGANIZATION_ID,
        ['cred-1'],
      );

      expect(readiness.get('cred-1')?.providerKey).toBe(
        CredentialPlatform.TWITTER,
      );
      expect(readiness.get('cred-1')?.providerKey).toBe('twitter');
    });

    it('resolves provider setup signals once per platform, not once per credential', async () => {
      const setupService = new PublishingProviderSetupService({
        get: (key: string) => HEALTHY_ENV[key],
      } as unknown as ConfigService);
      const resolveProviderSignals = vi.spyOn(
        setupService,
        'resolveProviderSignals',
      );
      findMany.mockResolvedValue([
        buildRow({ id: 'cred-1' }),
        buildRow({ id: 'cred-2' }),
        buildRow({ id: 'cred-3', platform: CredentialPlatform.LINKEDIN }),
      ]);

      const readiness = await new CredentialPublishingReadinessService(
        setupService,
        { get: () => ({ getQuotaStatus }) } as never,
        { credential: { findMany } } as never,
      ).resolveForCredentials(
        { credential: { findMany } } as never,
        ORGANIZATION_ID,
        ['cred-1', 'cred-2', 'cred-3'],
      );

      expect(readiness.size).toBe(3);
      expect(resolveProviderSignals).toHaveBeenCalledTimes(2);
    });

    it('carries no token material into the resolved records', async () => {
      const readiness = await build().resolveForCredentials(
        { credential: { findMany } } as never,
        ORGANIZATION_ID,
        ['cred-1'],
      );

      const serialized = JSON.stringify([...readiness.values()]);
      expect(serialized).not.toContain('encrypted-access');
      expect(serialized).not.toContain('encrypted-secret');
    });
  });

  describe('resolveForBrand', () => {
    it('reads only the brand’s connected channels, scoped to the organization', async () => {
      await build().resolveForBrand(ORGANIZATION_ID, 'brand-1');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
          where: expect.objectContaining({
            brandId: 'brand-1',
            isConnected: true,
            isDeleted: false,
            organizationId: ORGANIZATION_ID,
          }),
        }),
      );
    });

    it('returns one readiness record per channel, keyed by credential id', async () => {
      findMany.mockResolvedValue([
        buildRow({ id: 'cred-1' }),
        buildRow({ accessToken: null, id: 'cred-2', isConnected: false }),
      ]);

      const readiness = await build().resolveForBrand(
        ORGANIZATION_ID,
        'brand-1',
      );

      expect(readiness.map((entry) => entry.credentialId)).toEqual([
        'cred-1',
        'cred-2',
      ]);
      expect(readiness[1]).toMatchObject({
        canSchedule: false,
        state: 'blocked',
      });
      expect(readiness[1]?.requiredAction).toBe(
        'Reconnect the provider account before publishing.',
      );
    });

    it('blocks a provider the deployment never configured', async () => {
      vi.stubEnv('GENFEED_CLOUD', 'true');
      findMany.mockResolvedValue([
        buildRow({ platform: CredentialPlatform.LINKEDIN }),
      ]);

      const [readiness] = await build().resolveForBrand(
        ORGANIZATION_ID,
        'brand-1',
      );

      expect(readiness).toMatchObject({
        callbackUrlStatus: 'fail',
        canSchedule: false,
        state: 'blocked',
        // The token is fine — the deployment is what is broken.
        tokenFreshness: 'pass',
      });
      expect(readiness?.diagnostics[0]?.code).toBe('provider_not_configured');
    });
  });

  it('reports token problems ahead of setup problems', async () => {
    getQuotaStatus.mockResolvedValue(null);

    const readiness = await build().resolve({
      credential: {
        accessToken: null,
        id: 'cred-1',
        isConnected: false,
        platform: CredentialPlatform.TWITTER,
      } as unknown as CredentialDocument,
      organizationId: ORGANIZATION_ID,
      platform: CredentialPlatform.TWITTER,
    });

    expect(readiness.diagnostics[0]?.code).toBe('credential_disconnected');
    expect(readiness.requiredAction).toBe(
      'Reconnect the provider account before publishing.',
    );
  });

  describe('permissionScopeStatus', () => {
    it('stays unknown when granted scopes were never captured', async () => {
      const readiness = await resolveWithQuota(null);

      expect(readiness.permissionScopeStatus).toBe('unknown');
      expect(
        readiness.diagnostics.some((entry) => entry.scope === 'permission'),
      ).toBe(false);
    });

    it('passes when the persisted grant includes the required publish scope', async () => {
      const readiness = await build().resolve({
        credential: {
          ...buildCredential(),
          grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
          grantedScopesCapturedAt: new Date('2026-08-14T00:00:00.000Z'),
        } as unknown as CredentialDocument,
        organizationId: ORGANIZATION_ID,
        platform: CredentialPlatform.TWITTER,
      });

      expect(readiness.permissionScopeStatus).toBe('pass');
      expect(readiness.state).toBe('publish_capable');
    });

    it('fails with a reconnect diagnostic when a required scope is missing', async () => {
      findMany.mockResolvedValue([
        buildRow({
          grantedScopes: ['tweet.read', 'users.read'],
          grantedScopesCapturedAt: new Date('2026-08-14T00:00:00.000Z'),
        }),
      ]);

      const readiness = await build().resolveForCredentials(
        { credential: { findMany } } as never,
        ORGANIZATION_ID,
        ['cred-1'],
      );

      expect(readiness.get('cred-1')).toMatchObject({
        canSchedule: false,
        permissionScopeStatus: 'fail',
        state: 'blocked',
      });
      expect(
        readiness
          .get('cred-1')
          ?.diagnostics.find((entry) => entry.scope === 'permission'),
      ).toMatchObject({
        classification: 'missing_permission_scope',
        code: 'credential_missing_permission_scope',
        details: {
          grantedScopes: ['tweet.read', 'users.read'],
          missingScopes: ['tweet.write'],
          requiredScopes: ['tweet.write'],
        },
      });
    });

    it('flips to fail when a refresh persisted a narrower grant', async () => {
      findMany.mockResolvedValue([
        buildRow({
          grantedScopes: ['tweet.read'],
          grantedScopesCapturedAt: new Date('2026-08-14T00:00:00.000Z'),
        }),
      ]);

      const readiness = await build().resolveForBrand(
        ORGANIZATION_ID,
        'brand-1',
      );

      expect(readiness[0]).toMatchObject({
        permissionScopeStatus: 'fail',
        state: 'blocked',
      });
    });
  });
});
