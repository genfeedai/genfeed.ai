import { PUBLISHING_PROVIDER_ENV_DESCRIPTORS } from '@api/collections/publishing-setup/publishing-setup.constants';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import type { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IPublishingSetupCheck } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

const AUTH_SECRET_VALUE = 'better-auth-secret-value';
const REDIS_URL_VALUE = 'redis://cache.example.com:6379';

function buildConfiguredEnv(): Record<string, string> {
  const env: Record<string, string> = {
    BETTER_AUTH_SECRET: AUTH_SECRET_VALUE,
    GENFEEDAI_API_PUBLIC_URL: 'https://api.example.com',
    GENFEEDAI_APP_URL: 'https://app.example.com',
    REDIS_URL: REDIS_URL_VALUE,
  };

  for (const descriptor of PUBLISHING_PROVIDER_ENV_DESCRIPTORS) {
    for (const key of descriptor.clientIdKeys) {
      env[key] = `${descriptor.platform}-app-identifier`;
    }
    for (const key of descriptor.clientSecretKeys) {
      env[key] = `${descriptor.platform}-app-secret-value`;
    }
    for (const key of descriptor.redirectUriKeys) {
      env[key] = `https://app.example.com/oauth/${descriptor.platform}`;
    }
  }

  return env;
}

function findCheck(
  checks: IPublishingSetupCheck[],
  key: string,
): IPublishingSetupCheck {
  const check = checks.find((candidate) => candidate.key === key);
  if (!check) {
    throw new Error(`Expected check "${key}" to be present.`);
  }
  return check;
}

describe('PublishingSetupService', () => {
  let env: Record<string, string>;
  let prisma: { $queryRaw: ReturnType<typeof vi.fn> };
  let microservices: { checkRedisHealth: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let service: PublishingSetupService;

  function build(): PublishingSetupService {
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    // Real collaborator: the provider/callback checks are the behaviour under
    // test here, they just live in a separately injectable service now.
    return new PublishingSetupService(
      configService,
      logger as unknown as LoggerService,
      microservices as unknown as MicroservicesService,
      prisma as unknown as PrismaService,
      new PublishingProviderSetupService(configService),
    );
  }

  beforeEach(() => {
    vi.stubEnv('GENFEED_CLOUD', '');
    env = buildConfiguredEnv();
    prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) };
    microservices = { checkRedisHealth: vi.fn().mockResolvedValue(true) };
    logger = { error: vi.fn(), warn: vi.fn() };
    service = build();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns a contract-shaped checklist that probes both core runtime dependencies', async () => {
    const checklist = await service.buildChecklist();

    expect(Object.keys(checklist).sort()).toEqual([
      'checks',
      'generatedAt',
      'state',
    ]);
    expect(checklist.generatedAt).toBe(
      new Date(checklist.generatedAt).toISOString(),
    );
    expect(checklist.state).toBe('publish_capable');
    for (const check of checklist.checks) {
      expect(Object.keys(check).sort()).toEqual([
        'diagnostics',
        'key',
        'label',
        'scope',
        'status',
      ]);
    }

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(microservices.checkRedisHealth).toHaveBeenCalledTimes(1);
    expect(findCheck(checklist.checks, 'core_runtime.database').status).toBe(
      'pass',
    );
    expect(findCheck(checklist.checks, 'core_runtime.queue').status).toBe(
      'pass',
    );
    expect(findCheck(checklist.checks, 'auth.session_secret').status).toBe(
      'pass',
    );
    expect(findCheck(checklist.checks, 'callback.public_urls').status).toBe(
      'pass',
    );
    expect(findCheck(checklist.checks, 'provider.twitter').status).toBe('pass');
  });

  it('degrades the database check instead of failing the request when the probe rejects', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED 5432'));

    const checklist = await service.buildChecklist();
    const check = findCheck(checklist.checks, 'core_runtime.database');

    expect(check.status).toBe('fail');
    expect(check.diagnostics[0]).toMatchObject({
      classification: 'provider_outage',
      code: 'database_unreachable',
      isRetryable: true,
      severity: 'error',
    });
    expect(checklist.state).toBe('blocked');
    expect(findCheck(checklist.checks, 'core_runtime.queue').status).toBe(
      'pass',
    );
  });

  it('reports a missing queue backend as misconfiguration rather than an outage', async () => {
    delete env.REDIS_URL;
    microservices.checkRedisHealth.mockResolvedValue(false);

    const check = findCheck(
      (await build().buildChecklist()).checks,
      'core_runtime.queue',
    );

    expect(check.status).toBe('fail');
    expect(check.diagnostics[0]).toMatchObject({
      classification: 'misconfiguration',
      code: 'queue_backend_not_configured',
      isRetryable: false,
    });
  });

  it('reports a configured but unreachable queue backend as a retryable outage', async () => {
    microservices.checkRedisHealth.mockResolvedValue(false);

    const check = findCheck(
      (await build().buildChecklist()).checks,
      'core_runtime.queue',
    );

    expect(check.status).toBe('fail');
    expect(check.diagnostics[0]).toMatchObject({
      classification: 'provider_outage',
      code: 'queue_backend_unreachable',
      isRetryable: true,
    });
  });

  it('fails the auth check when the session secret is absent', async () => {
    delete env.BETTER_AUTH_SECRET;

    const check = findCheck(
      (await build().buildChecklist()).checks,
      'auth.session_secret',
    );

    expect(check.status).toBe('fail');
    expect(check.diagnostics[0]).toMatchObject({
      classification: 'misconfiguration',
      code: 'auth_secret_missing',
      scope: 'auth',
    });
  });

  it('warns on loopback callback origins in self-hosted mode and fails them in cloud', async () => {
    env.GENFEEDAI_API_PUBLIC_URL = 'http://localhost:3010';
    env.GENFEEDAI_APP_URL = 'http://localhost:3000';

    expect(
      findCheck((await build().buildChecklist()).checks, 'callback.public_urls')
        .status,
    ).toBe('warn');

    vi.stubEnv('GENFEED_CLOUD', 'true');

    expect(
      findCheck((await build().buildChecklist()).checks, 'callback.public_urls')
        .status,
    ).toBe('fail');
  });

  it('fails a provider whose configured redirect URI is not an absolute URL', async () => {
    env.TWITTER_REDIRECT_URI = '/oauth/twitter';

    const check = findCheck(
      (await build().buildChecklist()).checks,
      'provider.twitter',
    );

    expect(check.status).toBe('fail');
    expect(check.diagnostics[0]).toMatchObject({
      classification: 'misconfiguration',
      code: 'provider_redirect_uri_invalid',
      details: { envKey: 'TWITTER_REDIRECT_URI' },
    });
  });

  it('treats absent provider credentials as a self-hosted warning and a cloud failure', async () => {
    delete env.TWITTER_CLIENT_ID;
    delete env.TWITTER_CLIENT_SECRET;
    delete env.TWITTER_REDIRECT_URI;

    const selfHosted = findCheck(
      (await build().buildChecklist()).checks,
      'provider.twitter',
    );
    expect(selfHosted.status).toBe('warn');
    expect(selfHosted.diagnostics[0]).toMatchObject({
      classification: 'unsupported_self_host_mode',
      code: 'provider_not_configured',
      severity: 'warning',
    });

    vi.stubEnv('GENFEED_CLOUD', 'true');

    const cloud = findCheck(
      (await build().buildChecklist()).checks,
      'provider.twitter',
    );
    expect(cloud.status).toBe('fail');
    expect(cloud.diagnostics[0]?.severity).toBe('error');
  });

  it('fails a partially configured provider in every deployment mode', async () => {
    delete env.TWITTER_CLIENT_SECRET;

    for (const cloudFlag of ['', 'true']) {
      vi.stubEnv('GENFEED_CLOUD', cloudFlag);

      const check = findCheck(
        (await build().buildChecklist()).checks,
        'provider.twitter',
      );

      expect(check.status).toBe('fail');
      expect(check.diagnostics[0]).toMatchObject({
        classification: 'misconfiguration',
        code: 'provider_partially_configured',
        details: { missingEnvKeys: ['TWITTER_CLIENT_SECRET'] },
        severity: 'error',
      });
    }
  });

  it('exports severity-sorted diagnostics without any secret material', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED 5432'));
    delete env.TWITTER_CLIENT_ID;
    delete env.TWITTER_CLIENT_SECRET;
    delete env.TWITTER_REDIRECT_URI;

    const exported = await build().exportDiagnostics();
    const serialized = JSON.stringify(exported);

    expect(Object.keys(exported).sort()).toEqual([
      'checklist',
      'deployment',
      'diagnostics',
      'generatedAt',
    ]);
    expect(exported.deployment).toBe('self-hosted');
    expect(exported.diagnostics.length).toBeGreaterThan(1);
    expect(exported.diagnostics[0]?.severity).toBe('error');
    expect(exported.diagnostics.at(-1)?.severity).toBe('warning');
    expect(serialized).not.toContain(AUTH_SECRET_VALUE);
    expect(serialized).not.toContain(REDIS_URL_VALUE);
    expect(serialized).not.toContain('app-secret-value');
    expect(serialized).not.toContain('app-identifier');
  });

  it('produces an identical checklist shape across repeated calls', async () => {
    const first = await service.buildChecklist();
    const second = await service.buildChecklist();

    expect(second.checks).toEqual(first.checks);
  });
});
