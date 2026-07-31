import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import { BadRequestException } from '@nestjs/common';

/** Fully configured self-hosted deployment: setup contributes no problems. */
const HEALTHY_ENV: Record<string, string> = {
  GENFEEDAI_API_PUBLIC_URL: 'https://api.example.com',
  GENFEEDAI_APP_URL: 'https://app.example.com',
  TWITTER_CLIENT_ID: 'twitter-app-identifier',
  TWITTER_CLIENT_SECRET: 'twitter-app-secret-value',
  TWITTER_REDIRECT_URI: 'https://app.example.com/oauth/twitter',
};

type MockCredentialRow = {
  accessToken: string | null;
  accessTokenExpiry: Date | null;
  accessTokenSecret: string | null;
  id: string;
  isConnected: boolean;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  platform: string;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
};

function makeRow(
  overrides: Partial<MockCredentialRow> = {},
): MockCredentialRow {
  return {
    accessToken: 'access-token-value',
    accessTokenExpiry: new Date('2026-08-01T00:00:00.000Z'),
    accessTokenSecret: null,
    id: 'cred-x',
    isConnected: true,
    oauthToken: null,
    oauthTokenSecret: null,
    platform: CredentialPlatform.TWITTER,
    refreshToken: null,
    refreshTokenExpiry: null,
    ...overrides,
  };
}

describe('PostGroupReadinessService', () => {
  const now = new Date('2026-07-08T22:25:13.000Z');
  let env: Record<string, string>;
  let service: PostGroupReadinessService;
  let tx: { credential: { findMany: ReturnType<typeof vi.fn> } };

  function build(): PostGroupReadinessService {
    // Real collaborator: setup-signal resolution is pure config reading, and
    // stubbing it would hide the axes these tests exist to pin down.
    return new PostGroupReadinessService(
      new PublishingProviderSetupService({
        get: (key: string) => env[key],
      } as unknown as ConfigService),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('GENFEED_CLOUD', '');
    env = { ...HEALTHY_ENV };
    service = build();
    tx = { credential: { findMany: vi.fn().mockResolvedValue([makeRow()]) } };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('resolves readiness through a tenant-scoped, soft-delete-filtered query', async () => {
    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
      'cred-x',
    ]);

    expect(tx.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['cred-x'] },
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
  });

  it('skips the query when there are no credentials to resolve', async () => {
    await expect(
      service.resolveForCredentials(tx, 'org-1', []),
    ).resolves.toEqual(new Map());
    expect(tx.credential.findMany).not.toHaveBeenCalled();
  });

  it('never exposes credential token material in the resolved readiness', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({
        accessToken: 'super-secret-access-token',
        refreshToken: 'super-secret-refresh-token',
      }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(JSON.stringify(readiness.get('cred-x'))).not.toContain('secret');
  });

  it('marks a disconnected credential as blocked and not schedulable', async () => {
    tx.credential.findMany.mockResolvedValue([makeRow({ isConnected: false })]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: false,
      state: 'blocked',
      tokenFreshness: 'fail',
    });
  });

  it('keeps a refreshable expired credential schedulable but degraded', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
        refreshToken: 'refresh-token-value',
        refreshTokenExpiry: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'degraded',
      tokenFreshness: 'warn',
    });
  });

  it('keeps unknown token expiry schedulable', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({ accessTokenExpiry: null }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'unknown',
    });
  });

  it('resolves the deployment setup axes instead of defaulting them to unknown', async () => {
    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      // X gates publishing behind an access tier we cannot observe.
      appReviewStatus: 'unknown',
      callbackUrlStatus: 'pass',
      canSchedule: true,
      // Quota is deliberately not measured on the scheduler path.
      quotaStatus: 'unknown',
      state: 'publish_capable',
    });
    expect(
      readiness.get('cred-x')?.diagnostics.map((entry) => entry.code),
    ).toEqual(['provider_app_review_unverified']);
    // An info-severity FYI must not become the target's required action.
    expect(readiness.get('cred-x')?.requiredAction).toBeUndefined();
  });

  it('degrades an unconfigured provider on self-hosted without blocking it', async () => {
    env = {
      GENFEEDAI_API_PUBLIC_URL: HEALTHY_ENV.GENFEEDAI_API_PUBLIC_URL,
      GENFEEDAI_APP_URL: HEALTHY_ENV.GENFEEDAI_APP_URL,
    };

    const readiness = await build().resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      appReviewStatus: 'fail',
      callbackUrlStatus: 'warn',
      canSchedule: true,
      state: 'degraded',
      // The token is fine — the deployment is what is incomplete.
      tokenFreshness: 'pass',
    });
  });

  it('blocks an unconfigured provider on cloud before any publish work is queued', async () => {
    env = {
      GENFEEDAI_API_PUBLIC_URL: HEALTHY_ENV.GENFEEDAI_API_PUBLIC_URL,
      GENFEEDAI_APP_URL: HEALTHY_ENV.GENFEEDAI_APP_URL,
    };
    vi.stubEnv('GENFEED_CLOUD', 'true');

    const readiness = await build().resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      callbackUrlStatus: 'fail',
      canSchedule: false,
      state: 'blocked',
      tokenFreshness: 'pass',
    });

    try {
      service.assertSchedulable(
        { credentialId: 'cred-x', platform: CredentialPlatform.TWITTER },
        readiness.get('cred-x'),
      );
      expect.unreachable('assertSchedulable should have thrown');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        classification: 'unsupported_self_host_mode',
        readinessState: 'blocked',
        requiredAction:
          'Register a X (Twitter) developer app and set TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET to publish to it.',
      });
    }
  });

  it('resolves setup signals once per platform rather than once per target', async () => {
    const resolveProviderSignals = vi.spyOn(
      PublishingProviderSetupService.prototype,
      'resolveProviderSignals',
    );
    tx.credential.findMany.mockResolvedValue([
      makeRow({ id: 'cred-a' }),
      makeRow({ id: 'cred-b' }),
      makeRow({ id: 'cred-c', platform: CredentialPlatform.LINKEDIN }),
    ]);

    await build().resolveForCredentials(tx, 'org-1', [
      'cred-a',
      'cred-b',
      'cred-c',
    ]);

    // Two distinct platforms across three credentials.
    expect(resolveProviderSignals).toHaveBeenCalledTimes(2);
    resolveProviderSignals.mockRestore();
  });

  it('adds no database round-trips beyond the single credential query', async () => {
    await service.resolveForCredentials(tx, 'org-1', ['cred-x']);

    expect(tx.credential.findMany).toHaveBeenCalledTimes(1);
  });

  describe('assertSchedulable', () => {
    const target = {
      credentialId: 'cred-x',
      platform: CredentialPlatform.TWITTER,
    };

    it('passes a publish-capable channel through', async () => {
      const readiness = await service.resolveForCredentials(tx, 'org-1', [
        'cred-x',
      ]);

      expect(() =>
        service.assertSchedulable(target, readiness.get('cred-x')),
      ).not.toThrow();
    });

    it('throws an actionable error for a blocked channel', async () => {
      tx.credential.findMany.mockResolvedValue([
        makeRow({ accessToken: null }),
      ]);
      const readiness = await service.resolveForCredentials(tx, 'org-1', [
        'cred-x',
      ]);

      try {
        service.assertSchedulable(target, readiness.get('cred-x'));
        expect.unreachable('assertSchedulable should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          classification: 'expired_credential',
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
          readinessState: 'blocked',
          requiredAction: 'Reconnect the provider account before publishing.',
          title: 'Channel not ready to publish',
        });
      }
    });

    it('throws when readiness could not be resolved for the target', () => {
      expect(() => service.assertSchedulable(target, undefined)).toThrow(
        BadRequestException,
      );
    });
  });
});
