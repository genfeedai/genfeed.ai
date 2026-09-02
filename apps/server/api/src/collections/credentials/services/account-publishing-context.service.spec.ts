import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';

/** Fully configured self-hosted deployment: setup contributes no problems. */
const HEALTHY_ENV: Record<string, string> = {
  GENFEEDAI_API_PUBLIC_URL: 'https://api.example.com',
  GENFEEDAI_APP_URL: 'https://app.example.com',
  TWITTER_CLIENT_ID: 'twitter-app-identifier',
  TWITTER_CLIENT_SECRET: 'twitter-app-secret-value',
  TWITTER_REDIRECT_URI: 'https://app.example.com/oauth/twitter',
};

describe('AccountPublishingContextService', () => {
  const credentialId = 'cred-1';
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  const credentialsService = {
    findOne: vi.fn(),
  };
  const accountHealthService = {
    assessCredentialHealth: vi.fn(),
  };
  const prisma = {
    brand: {
      findFirst: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
  };
  const quotaService = {
    getQuotaStatus: vi.fn(),
  };
  // Real readiness collaborators over a healthy configuration, so these
  // assertions still exercise the token axis rather than a stubbed verdict.
  const service = new AccountPublishingContextService(
    accountHealthService as unknown as AccountHealthService,
    new CredentialPublishingReadinessService(
      new PublishingProviderSetupService({
        get: (key: string) => HEALTHY_ENV[key],
      } as unknown as ConfigService),
      { get: () => quotaService } as never,
      prisma as never,
    ),
    credentialsService as never,
    prisma as never,
    logger as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GENFEED_CLOUD', '');
    quotaService.getQuotaStatus.mockResolvedValue(null);
    credentialsService.findOne.mockResolvedValue({
      id: credentialId,
      accessToken: 'secret-token',
      accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
      accessTokenSecret: 'access-token-secret',
      brandId,
      externalHandle: 'vincent',
      isConnected: true,
      isDeleted: false,
      label: 'Founder X',
      oauthToken: 'oauth-secret',
      oauthTokenSecret: 'oauth-token-secret',
      organizationId,
      platform: CredentialPlatform.TWITTER,
      refreshToken: 'refresh-secret',
    });
    accountHealthService.assessCredentialHealth.mockResolvedValue({
      credentialId,
      holdPublishing: true,
      holdReason: 'twitter publishing is held for warmup.',
      label: 'Founder X',
      override: { isActive: false },
      platform: CredentialPlatform.TWITTER,
      riskLevel: 'medium',
      score: 56,
      signals: {
        connectedDays: 1,
        profileSignals: 2,
        publishedPosts: 0,
        recentFailures: 0,
      },
      state: 'warming',
      thresholds: {
        maxRecentFailures: 0,
        minConnectedDays: 10,
        minProfileSignals: 2,
        minPublishedPosts: 4,
      },
    });
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { replyStyle: 'direct' },
      description: 'AI content OS',
      id: brandId,
      label: 'Genfeed',
      slug: 'genfeed',
      text: 'Direct, useful, technical.',
    });
    prisma.post.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        description: 'Recent X post',
        id: 'post-1',
        label: 'Recent',
        platform: CredentialPlatform.TWITTER,
        status: 'DRAFT',
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps a Prisma SCREAMING credential platform onto domain limits', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      id: credentialId,
      accessToken: 'secret-token',
      accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
      brandId,
      isConnected: true,
      isDeleted: false,
      label: 'Founder X',
      organizationId,
      platform: 'TWITTER',
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.account.platform).toBe(CredentialPlatform.TWITTER);
    expect(context.constraints.maxWeightedCharacters).toBe(280);
  });

  it('resolves credentials with strict organization and brand guards', async () => {
    await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: credentialId,
      brandId,
      isConnected: true,
      organizationId,
    });
    expect(accountHealthService.assessCredentialHealth).toHaveBeenCalledWith({
      brandId,
      credentialId,
      organizationId,
    });
  });

  it('throws when the guarded credential is missing', async () => {
    credentialsService.findOne.mockResolvedValueOnce(null);

    await expect(
      service.resolve({
        brandId,
        credentialId,
        organizationId,
        surface: 'post',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns account context without credential token fields', async () => {
    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    const serialized = JSON.stringify(context);
    expect(context.account).toEqual(
      expect.objectContaining({
        handle: 'vincent',
        id: credentialId,
        label: 'Founder X',
        platform: CredentialPlatform.TWITTER,
      }),
    );
    expect(context.accountHealth?.state).toBe('warming');
    expect(context.readiness).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
    expect(context.promptHints).toContain(
      'Account warmup: warming (medium risk, score 56)',
    );
    expect(context.promptHints).toContain(
      'Provider readiness: publish_capable',
    );
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('access-token-secret');
    expect(serialized).not.toContain('oauth-secret');
    expect(serialized).not.toContain('oauth-token-secret');
    expect(serialized).not.toContain('refresh-secret');
  });

  it('uses a later OAuth token field when an earlier token field is empty', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: '',
      accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
      brandId,
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      oauthToken: 'oauth-secret',
      organizationId,
      platform: CredentialPlatform.TWITTER,
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.readiness).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
  });

  it('surfaces a retryable degraded state when access can be refreshed', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: 'secret-token',
      accessTokenExpiry: new Date('2000-01-01T00:00:00.000Z'),
      brandId,
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.TWITTER,
      refreshToken: 'refresh-secret',
      refreshTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.readiness).toMatchObject({
      canSchedule: true,
      isRetryable: true,
      state: 'degraded',
      tokenFreshness: 'warn',
    });
    expect(context.readiness.diagnostics[0]?.code).toBe(
      'credential_access_token_refresh_required',
    );
  });

  it('blocks an expired credential without a usable refresh path', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: 'secret-token',
      accessTokenExpiry: new Date('2000-01-01T00:00:00.000Z'),
      brandId,
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.TWITTER,
      refreshToken: null,
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.readiness).toMatchObject({
      canSchedule: false,
      state: 'blocked',
      tokenFreshness: 'fail',
    });
    expect(context.promptHints).toContain(
      'Provider action: Reconnect the provider account before publishing.',
    );
  });

  it('keeps missing token expiry metadata explicit and non-blocking', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: 'secret-token',
      accessTokenExpiry: null,
      brandId,
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.TWITTER,
      refreshToken: null,
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.readiness).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'unknown',
    });
  });

  it('resolves every readiness axis instead of defaulting them to unknown', async () => {
    quotaService.getQuotaStatus.mockResolvedValue({
      allowed: true,
      currentCount: 9,
      dailyLimit: 10,
      platform: CredentialPlatform.TWITTER,
    });

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(quotaService.getQuotaStatus).toHaveBeenCalledWith(
      credentialId,
      organizationId,
    );
    expect(context.readiness).toMatchObject({
      // Configured provider, public callback origins, near-quota account.
      appReviewStatus: 'unknown',
      callbackUrlStatus: 'pass',
      canSchedule: true,
      // Granted OAuth scopes are not persisted, so this axis stays unresolved.
      permissionScopeStatus: 'unknown',
      quotaStatus: 'warn',
      state: 'degraded',
      tokenFreshness: 'pass',
    });
    expect(context.readiness.diagnostics.map((entry) => entry.code)).toEqual([
      'provider_app_review_unverified',
      'credential_daily_quota_nearly_exhausted',
    ]);
  });

  it('blocks on a provider the deployment has never configured', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: 'secret-token',
      accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
      brandId,
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });
    vi.stubEnv('GENFEED_CLOUD', 'true');

    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'post',
    });

    expect(context.readiness).toMatchObject({
      appReviewStatus: 'fail',
      callbackUrlStatus: 'fail',
      canSchedule: false,
      state: 'blocked',
      // The token itself is fine — the deployment is what is broken.
      tokenFreshness: 'pass',
    });
    expect(context.readiness.diagnostics[0]?.code).toBe(
      'provider_not_configured',
    );
  });

  it('marks X Articles as copy-only rich-copy surfaces', async () => {
    const context = await service.resolve({
      brandId,
      credentialId,
      organizationId,
      surface: 'x-article',
    });

    expect(context.publishability).toBe('copy_only');
    expect(context.constraints.supportsDirectPublishing).toBe(false);
    expect(context.constraints.supportsRichArticleCopy).toBe(true);
  });
});
