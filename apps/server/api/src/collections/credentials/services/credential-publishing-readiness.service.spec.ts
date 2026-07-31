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

describe('CredentialPublishingReadinessService', () => {
  let getQuotaStatus: ReturnType<typeof vi.fn>;

  function build(): CredentialPublishingReadinessService {
    return new CredentialPublishingReadinessService(
      new PublishingProviderSetupService({
        get: (key: string) => HEALTHY_ENV[key],
      } as unknown as ConfigService),
      { get: () => ({ getQuotaStatus }) } as never,
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
});
