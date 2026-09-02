import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
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

/**
 * The scheduler owns the gate, not the derivation — that lives in
 * `CredentialPublishingReadinessService` and is pinned by its own spec. These
 * tests use the real collaborator so the gate is exercised against genuine
 * verdicts rather than a stubbed shape that could drift from the contract.
 */
describe('PostGroupReadinessService', () => {
  const now = new Date('2026-07-08T22:25:13.000Z');
  let env: Record<string, string>;
  let service: PostGroupReadinessService;
  let tx: { credential: { findMany: ReturnType<typeof vi.fn> } };

  function build(): PostGroupReadinessService {
    return new PostGroupReadinessService(
      new CredentialPublishingReadinessService(
        new PublishingProviderSetupService({
          get: (key: string) => env[key],
        } as unknown as ConfigService),
        { get: () => ({ getQuotaStatus: vi.fn() }) } as never,
        { credential: { findMany: vi.fn() } } as never,
      ),
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

  it('resolves readiness against the scheduler transaction, tenant-scoped', async () => {
    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
      'cred-x',
    ]);

    // The write path must read through `tx`, never a fresh connection, so the
    // verdict and the rows it gates come from one snapshot.
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

  it('leaves an info-severity setup FYI out of the target required action', async () => {
    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(
      readiness.get('cred-x')?.diagnostics.map((entry) => entry.code),
    ).toEqual(['provider_app_review_unverified']);
    // `buildPublishingProviderReadiness` normalizes "no corrective action" to
    // null, so the contract's optional-and-nullable field lands as null here.
    expect(readiness.get('cred-x')?.requiredAction).toBeNull();
  });

  it('blocks an unconfigured provider on cloud before any publish work is queued', async () => {
    env = {
      GENFEEDAI_API_PUBLIC_URL: HEALTHY_ENV.GENFEEDAI_API_PUBLIC_URL,
      GENFEEDAI_APP_URL: HEALTHY_ENV.GENFEEDAI_APP_URL,
    };
    vi.stubEnv('GENFEED_CLOUD', 'true');
    const cloudService = build();

    const readiness = await cloudService.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      callbackUrlStatus: 'fail',
      canSchedule: false,
      state: 'blocked',
      tokenFreshness: 'pass',
    });

    try {
      cloudService.assertSchedulable(
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

    it('lets a degraded channel schedule rather than failing the mutation', async () => {
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

      expect(readiness.get('cred-x')?.state).toBe('degraded');
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

    /**
     * `HttpException.initMessage()` only picks up a response object's `message`
     * when it is a string — without one it falls back to the literal
     * `'Bad Request Exception'`. The HTTP surface never noticed, because
     * `HttpExceptionFilter` renders `detail`. In-process callers do: the agent
     * publish tool reports `error.message` straight back to the user, so a
     * blocked channel read as `'Bad Request Exception'` with no reason attached.
     */
    it('carries a readable reason on the exception itself, not just in the payload', async () => {
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
        const thrown = error as BadRequestException;
        expect(thrown.message).toBe(
          'X: The provider account has no usable access credential. Reconnect the provider account before publishing.',
        );
        // The structured payload keeps its own fields; `message` is additive.
        expect(thrown.getResponse()).toMatchObject({
          detail: 'The provider account has no usable access credential.',
          message: thrown.message,
          title: 'Channel not ready to publish',
        });
      }
    });

    it('names the channel when readiness could not be resolved at all', () => {
      try {
        service.assertSchedulable(target, undefined);
        expect.unreachable('assertSchedulable should have thrown');
      } catch (error) {
        const thrown = error as BadRequestException;
        expect(thrown.message).toBe(
          'X: publishing readiness could not be resolved for this channel.',
        );
      }
    });
  });
});
