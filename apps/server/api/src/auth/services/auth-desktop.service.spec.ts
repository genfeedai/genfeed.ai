import { createHash } from 'node:crypto';
import type { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetIsSuperAdmin } = vi.hoisted(() => ({
  mockGetIsSuperAdmin: vi.fn(),
}));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: mockGetIsSuperAdmin,
}));

vi.mock('@api/auth/better-auth/better-auth.service', () => ({
  BetterAuthService: class BetterAuthService {},
}));

vi.mock('@api/collections/api-keys/services/api-keys.service', () => ({
  ApiKeysService: class ApiKeysService {},
}));

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: class LoggerService {},
}));

vi.mock('@genfeedai/enums', () => ({
  ActionOrigin: {
    UI: 'ui',
  },
  API_KEY_ACTION_ORIGIN_METADATA_KEY: 'actionOrigin',
  ApiKeyCategory: {
    GENFEEDAI: 'GENFEEDAI',
  },
  ApiKeyScope: {
    ADMIN: 'ADMIN',
    ANALYTICS_READ: 'ANALYTICS_READ',
    ARTICLES_CREATE: 'ARTICLES_CREATE',
    ARTICLES_READ: 'ARTICLES_READ',
    BRANDS_READ: 'BRANDS_READ',
    CREDITS_PROVISION: 'CREDITS_PROVISION',
    CREDITS_READ: 'CREDITS_READ',
    IMAGES_CREATE: 'IMAGES_CREATE',
    IMAGES_READ: 'IMAGES_READ',
    IMAGES_UPDATE: 'IMAGES_UPDATE',
    POSTS_CREATE: 'POSTS_CREATE',
    PROMPTS_CREATE: 'PROMPTS_CREATE',
    PROMPTS_READ: 'PROMPTS_READ',
    VIDEOS_CREATE: 'VIDEOS_CREATE',
    VIDEOS_READ: 'VIDEOS_READ',
    VIDEOS_UPDATE: 'VIDEOS_UPDATE',
  },
}));

const { AuthDesktopService } = await import('./auth-desktop.service.ts');

const userId = testId('user');
const organizationId = testId('org');
const codeVerifier = 'desktop-code-verifier-desktop-code-verifier-desktop-code';
const state = 'desktop-state-desktop-state';

const desktopCookie = {
  cookieName: 'better-auth.session_token',
  cookieValue: 'better-auth-session-token.signature',
  expiresAt: '2026-11-03T12:00:00.000Z',
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: false,
};

interface BuildServiceOptions {
  apiKeyError?: Error;
  isBetterAuthDisabled?: boolean;
}

const toBase64Url = (input: Buffer): string =>
  input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const buildCodeChallenge = (verifier: string): string =>
  toBase64Url(createHash('sha256').update(verifier).digest());

const makeUser = (): User =>
  ({
    emailAddresses: [{ emailAddress: 'desktop@example.com' }],
    firstName: 'Desktop',
    lastName: 'User',
    isSuperAdmin: false,
    organizationId: organizationId,
    userId: userId,
  }) as unknown as User;

const makeRequest = () => ({ context: {} }) as never;

function buildService(options: BuildServiceOptions = {}) {
  const records = new Map<string, Record<string, unknown>>();
  const issuedSessionTokens = new Set<string>();
  const apiKeysService = {
    createWithKey: options.apiKeyError
      ? vi.fn().mockRejectedValue(options.apiKeyError)
      : vi.fn().mockResolvedValue({ plainKey: 'gf_desktop_key' }),
  } as unknown as ApiKeysService;
  let sessionSequence = 0;
  const betterAuthService = {
    createDesktopSessionCookie: vi.fn(async () => {
      if (options.isBetterAuthDisabled) {
        return null;
      }
      sessionSequence += 1;
      const token = `better-auth-session-token-${sessionSequence}`;
      issuedSessionTokens.add(token);
      return {
        cookie: desktopCookie,
        token,
      };
    }),
    revokeDesktopSession: vi.fn(async (token: string) => {
      issuedSessionTokens.delete(token);
    }),
  } as unknown as BetterAuthService;
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const prisma = {
    desktopAuthCode: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = {
          ...data,
          id: 'desktop-auth-code-1',
          usedAt: null,
        };
        records.set(String(data.codeHash), record);
        return record;
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(
        async ({ where }: { where: { codeHash: string } }) =>
          records.get(where.codeHash) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { id: string; usedAt: null };
        }) => {
          const record = Array.from(records.values()).find(
            (candidate) =>
              candidate.id === where.id && candidate.usedAt === where.usedAt,
          );

          if (!record) {
            return { count: 0 };
          }

          Object.assign(record, data);
          return { count: 1 };
        },
      ),
    },
  } as unknown as PrismaService;

  return {
    apiKeysService,
    betterAuthService,
    issuedSessionTokens,
    logger,
    service: new AuthDesktopService(
      apiKeysService,
      betterAuthService,
      logger,
      prisma,
    ),
  };
}

async function createAuthorization(
  service: InstanceType<typeof AuthDesktopService>,
) {
  return service.createCode(makeUser(), makeRequest(), {
    codeChallenge: buildCodeChallenge(codeVerifier),
    codeChallengeMethod: 'S256',
    state,
  });
}

describe('AuthDesktopService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsSuperAdmin.mockReturnValue(false);
  });

  it('stores the browser auth code without creating credentials early', async () => {
    const { apiKeysService, betterAuthService, service } = buildService();

    const result = await createAuthorization(service);

    expect(result.code).toBeTypeOf('string');
    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();
    expect(betterAuthService.createDesktopSessionCookie).not.toHaveBeenCalled();
  });

  it('returns the API token and signed Better Auth session after a valid exchange', async () => {
    const { apiKeysService, betterAuthService, service } = buildService();
    const authorization = await createAuthorization(service);

    const result = await service.exchangeCode({
      code: authorization.code,
      codeVerifier,
      state,
    });

    expect(result.token).toBe('gf_desktop_key');
    expect(result.session).toEqual(desktopCookie);
    expect(betterAuthService.createDesktopSessionCookie).toHaveBeenCalledWith(
      userId,
    );
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: expect.any(String),
        metadata: { kind: 'desktop-session' },
        organizationId,
        userId,
      }),
      'ui',
    );
  });

  it('rejects a replay without minting a second API key or session', async () => {
    const { apiKeysService, betterAuthService, service } = buildService();
    const authorization = await createAuthorization(service);
    const exchange = {
      code: authorization.code,
      codeVerifier,
      state,
    };

    await service.exchangeCode(exchange);
    await expect(service.exchangeCode(exchange)).rejects.toThrow(
      'Invalid desktop authorization code',
    );

    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
    expect(betterAuthService.createDesktopSessionCookie).toHaveBeenCalledTimes(
      1,
    );
  });

  it('allows exactly one concurrent exchange to mint credentials', async () => {
    const { apiKeysService, betterAuthService, service } = buildService();
    const authorization = await createAuthorization(service);
    const exchange = {
      code: authorization.code,
      codeVerifier,
      state,
    };

    const results = await Promise.allSettled([
      service.exchangeCode(exchange),
      service.exchangeCode(exchange),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
    expect(betterAuthService.createDesktopSessionCookie).toHaveBeenCalledTimes(
      1,
    );
  });

  it('revokes the Better Auth session when API-key creation fails', async () => {
    const apiKeyError = new Error('API key store unavailable');
    const {
      apiKeysService,
      betterAuthService,
      issuedSessionTokens,
      logger,
      service,
    } = buildService({ apiKeyError });
    const authorization = await createAuthorization(service);

    await expect(
      service.exchangeCode({
        code: authorization.code,
        codeVerifier,
        state,
      }),
    ).rejects.toBe(apiKeyError);

    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
    expect(betterAuthService.revokeDesktopSession).toHaveBeenCalledWith(
      'better-auth-session-token-1',
    );
    expect(issuedSessionTokens.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      'Revoked Better Auth desktop session after API key creation failed',
      expect.objectContaining({ userId }),
    );
  });

  it('fails cleanly when Better Auth is disabled', async () => {
    const { apiKeysService, betterAuthService, service } = buildService({
      isBetterAuthDisabled: true,
    });
    const authorization = await createAuthorization(service);

    await expect(
      service.exchangeCode({
        code: authorization.code,
        codeVerifier,
        state,
      }),
    ).rejects.toThrow('Better Auth is required to create a desktop session');

    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();
    expect(betterAuthService.revokeDesktopSession).not.toHaveBeenCalled();
  });
});
