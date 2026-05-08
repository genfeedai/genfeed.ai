import { createHash } from 'node:crypto';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetIsSuperAdmin, mockGetPublicMetadata } = vi.hoisted(() => ({
  mockGetIsSuperAdmin: vi.fn(),
  mockGetPublicMetadata: vi.fn(),
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getIsSuperAdmin: mockGetIsSuperAdmin,
  getPublicMetadata: mockGetPublicMetadata,
}));

vi.mock('@api/collections/api-keys/services/api-keys.service', () => ({
  ApiKeysService: class ApiKeysService {},
}));

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('@genfeedai/enums', () => ({
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

const userId = '507f191e810c19729de860ee';
const organizationId = '607f191e810c19729de860ee';

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
    publicMetadata: {
      isSuperAdmin: false,
      organization: organizationId,
      user: userId,
    },
  }) as unknown as User;

const makeRequest = () => ({ context: {} }) as never;

function buildService() {
  const records = new Map<string, Record<string, unknown>>();
  const apiKeysService = {
    createWithKey: vi.fn().mockResolvedValue({ plainKey: 'gf_desktop_key' }),
  } as unknown as ApiKeysService;
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
    service: new AuthDesktopService(apiKeysService, prisma),
  };
}

describe('AuthDesktopService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsSuperAdmin.mockReturnValue(false);
    mockGetPublicMetadata.mockReturnValue({
      organization: organizationId,
      user: userId,
    });
  });

  it('stores the browser auth code without creating an API key early', async () => {
    const { apiKeysService, service } = buildService();
    const codeVerifier =
      'desktop-code-verifier-desktop-code-verifier-desktop-code';

    const result = await service.createCode(makeUser(), makeRequest(), {
      codeChallenge: buildCodeChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
      state: 'desktop-state-desktop-state',
    });

    expect(result.code).toBeTypeOf('string');
    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();
  });

  it('creates the desktop API key only after a valid PKCE exchange', async () => {
    const { apiKeysService, service } = buildService();
    const codeVerifier =
      'desktop-code-verifier-desktop-code-verifier-desktop-code';
    const state = 'desktop-state-desktop-state';
    const authorization = await service.createCode(makeUser(), makeRequest(), {
      codeChallenge: buildCodeChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
      state,
    });

    const result = await service.exchangeCode({
      code: authorization.code,
      codeVerifier,
      state,
    });

    expect(result.token).toBe('gf_desktop_key');
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: expect.any(Date),
        metadata: { kind: 'desktop-session' },
        organizationId,
        userId,
      }),
    );
  });

  it('consumes desktop auth codes once', async () => {
    const { service } = buildService();
    const codeVerifier =
      'desktop-code-verifier-desktop-code-verifier-desktop-code';
    const state = 'desktop-state-desktop-state';
    const authorization = await service.createCode(makeUser(), makeRequest(), {
      codeChallenge: buildCodeChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
      state,
    });

    await service.exchangeCode({
      code: authorization.code,
      codeVerifier,
      state,
    });

    await expect(
      service.exchangeCode({
        code: authorization.code,
        codeVerifier,
        state,
      }),
    ).rejects.toThrow('Invalid desktop authorization code');
  });
});
