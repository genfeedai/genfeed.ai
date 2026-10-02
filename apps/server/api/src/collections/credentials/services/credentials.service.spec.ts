// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Credential via the
// light @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime
// import required for BaseService's getModelMeta('credential') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import process from 'node:process';
import { CREDENTIAL_PROFILE_SYNCED_EVENT } from '@api/collections/credentials/constants/credential-events.constants';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import {
  CredentialsService,
  extractReconnectCredentialIdFromWarmupSignals,
} from '@api/collections/credentials/services/credentials.service';
import { ProviderAccountPurgeService } from '@api/collections/credentials/services/provider-account-purge.service';

import { CredentialPlatform, SubscriptionTier } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

const KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? 'test-encryption-key-for-testing-only';
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

describe('CredentialsService', () => {
  let service: CredentialsService;
  let crypto: CredentialCryptoService;
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    contentLearningAccount: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    contentLearningDependency: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    brand: { findFirst: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    credential: Record<string, ReturnType<typeof vi.fn>>;
    organizationSetting: Record<string, ReturnType<typeof vi.fn>>;
    post: Record<string, ReturnType<typeof vi.fn>>;
    postAnalytics: Record<string, ReturnType<typeof vi.fn>>;
    tag: Record<string, ReturnType<typeof vi.fn>>;
  };
  let logger: Record<string, ReturnType<typeof vi.fn>>;
  let filesClient: { uploadToS3: ReturnType<typeof vi.fn> };
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let accessBootstrapCache: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-org-id';
  const brandId = 'test-brand-id';

  beforeEach(() => {
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
      contentLearningAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentLearningDependency: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      brand: { findFirst: vi.fn().mockResolvedValue({ id: brandId }) },
      $transaction: vi.fn(),
      credential: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'new-id', ...args.data }),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(
          (args: { data: Record<string, unknown>; where?: { id?: string } }) =>
            Promise.resolve({
              id: args.where?.id ?? 'existing-id',
              ...args.data,
            }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      organizationSetting: {
        findUnique: vi.fn().mockResolvedValue({
          subscriptionTier: SubscriptionTier.FREE,
        }),
      },
      post: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      postAnalytics: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tag: {
        create: vi.fn().mockResolvedValue({ id: 'tag-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    crypto = new CredentialCryptoService({
      tokenEncryptionKey: KEY,
    } as unknown as ConfigService);
    filesClient = {
      uploadToS3: vi.fn().mockResolvedValue({
        publicUrl:
          'https://cdn.genfeed.ai/ingredients/social-avatars/existing-id',
      }),
    };

    eventEmitter = { emit: vi.fn() };
    accessBootstrapCache = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    service = new CredentialsService(
      prisma as never,
      logger as never,
      crypto,
      filesClient as never,
      new ProviderAccountPurgeService(
        prisma as never,
        accessBootstrapCache as never,
      ),
      eventEmitter as unknown as EventEmitter2,
      accessBootstrapCache as never,
    );
  });

  describe('normalizeDocument platform mapping', () => {
    it('maps Prisma SCREAMING platforms onto domain lowercase', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        id: 'cred-1',
        isDeleted: false,
        organizationId: orgId,
        platform: 'TWITTER',
      });

      const result = await service.findOne({ id: 'cred-1' });

      expect(result?.platform).toBe('twitter');
    });
  });

  describe('countConnected', () => {
    it('filters by organizationId and isDeleted: false', async () => {
      prisma.credential.count.mockResolvedValue(5);

      const result = await service.countConnected(orgId);

      expect(result).toBe(5);
      expect(prisma.credential.count).toHaveBeenCalledWith({
        where: {
          isConnected: true,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('includes brandId in filter when provided', async () => {
      prisma.credential.count.mockResolvedValue(3);

      const result = await service.countConnected(orgId, brandId);

      expect(result).toBe(3);
      expect(prisma.credential.count).toHaveBeenCalledWith({
        where: {
          brandId,
          isConnected: true,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('omits brandId from filter when undefined', async () => {
      await service.countConnected(orgId, undefined);

      const calledWith = prisma.credential.count.mock.calls[0][0];
      expect(calledWith.where).not.toHaveProperty('brandId');
    });

    it('omits brandId from filter when empty string', async () => {
      await service.countConnected(orgId, '');

      const calledWith = prisma.credential.count.mock.calls[0][0];
      expect(calledWith.where).not.toHaveProperty('brandId');
    });
  });

  describe('tenant-scoped lookups', () => {
    it('scopes handle reads to active credentials in the caller organization', async () => {
      await service.findByHandle('@acme', orgId);

      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        where: {
          externalHandle: { contains: 'acme', mode: 'insensitive' },
          isConnected: true,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });
  });

  describe('provider callback purge', () => {
    it('irreversibly clears provider identity and tokens across matching rows', async () => {
      prisma.credential.findMany.mockResolvedValue([
        { id: 'credential-1', organizationId: 'org-a' },
        { id: 'credential-2', organizationId: 'org-b' },
        { id: 'credential-3', organizationId: 'org-a' },
        { id: 'credential-4', organizationId: null },
      ]);
      prisma.credential.updateMany.mockResolvedValue({ count: 4 });

      const count = await service.purgeProviderAccount(
        CredentialPlatform.THREADS,
        '  provider-user-1  ',
      );

      expect(count).toBe(4);
      // Each affected tenant's cached bootstrap drops the purged accounts once.
      expect(accessBootstrapCache.invalidateForOrganization.mock.calls).toEqual(
        [['org-a'], ['org-b']],
      );
      expect(prisma.postAnalytics.deleteMany).toHaveBeenCalledWith({
        where: {
          platform: 'THREADS',
          post: {
            credentialId: {
              in: [
                'credential-1',
                'credential-2',
                'credential-3',
                'credential-4',
              ],
            },
          },
        },
      });
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          analyticsCollectionState: 'unavailable',
          externalId: null,
          externalShortcode: null,
          url: null,
        }),
        where: {
          credentialId: {
            in: [
              'credential-1',
              'credential-2',
              'credential-3',
              'credential-4',
            ],
          },
          platform: CredentialPlatform.THREADS,
        },
      });
      expect(prisma.credential.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accessToken: null,
          externalAvatar: null,
          externalHandle: null,
          externalId: null,
          externalName: null,
          grantedScopes: [],
          isConnected: false,
          isDeleted: true,
          oauthState: null,
          refreshToken: null,
          username: null,
          warmupSignals: {},
        }),
        where: {
          id: {
            in: [
              'credential-1',
              'credential-2',
              'credential-3',
              'credential-4',
            ],
          },
          platform: 'THREADS',
        },
      });
    });

    it('rejects an empty provider id without touching credentials', async () => {
      await expect(
        service.purgeProviderAccount(CredentialPlatform.THREADS, '   '),
      ).rejects.toThrow('external id');

      expect(prisma.credential.updateMany).not.toHaveBeenCalled();
      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).not.toHaveBeenCalled();
    });
  });

  describe('access bootstrap invalidation', () => {
    beforeEach(() => {
      const row = {
        id: 'existing-id',
        organizationId: orgId,
        brandId,
        platform: 'TWITTER',
        isConnected: true,
        isDeleted: false,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async (args) =>
        args.select
          ? Object.fromEntries(
              Object.keys(args.select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : row,
      );
      prisma.credential.update.mockImplementation(
        (args: { data: Record<string, unknown>; where?: { id?: string } }) =>
          Promise.resolve({
            id: args.where?.id ?? 'existing-id',
            organizationId: orgId,
            ...args.data,
          }),
      );
    });

    it('invalidates the organization bootstrap when a credential is created', async () => {
      await service.create({
        brandId,
        isConnected: true,
        organizationId: orgId,
        platform: CredentialPlatform.TWITTER,
        userId: 'u1',
      } as never);

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('invalidates the organization bootstrap on disconnect', async () => {
      await service.patch('existing-id', { isConnected: false });

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('invalidates the organization bootstrap on soft delete', async () => {
      await service.remove('existing-id');

      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isDeleted: true } }),
      );
      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('keeps the bootstrap cached for writes it does not embed', async () => {
      await service.patch('existing-id', {
        oauthState: 'state-1',
        refreshToken: 'refresh-token',
      });

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).not.toHaveBeenCalled();
    });

    it('invalidates the filtered organization after a bulk disconnect', async () => {
      await service.patchAll(
        { brandId, organizationId: orgId },
        { isConnected: false },
      );

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('skips invalidation when a bulk write matched no rows', async () => {
      prisma.credential.findMany.mockResolvedValue([]);
      prisma.credential.updateMany.mockResolvedValue({ count: 0 });

      await service.patchAll(
        { brandId, organizationId: orgId },
        { isConnected: false },
      );

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).not.toHaveBeenCalled();
    });

    it('invalidates the organization bootstrap once a connection settles', async () => {
      const row = {
        brandId,
        externalId: null,
        id: 'existing-id',
        organizationId: orgId,
        platform: 'TWITTER',
        isConnected: false,
        isDeleted: false,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async ({ select }) =>
        select
          ? Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : { ...row },
      );

      await service.connectAccount(
        'existing-id',
        orgId,
        { handle: 'acme', id: 'provider-1', name: 'Acme' },
        { accessToken: 'token' },
      );

      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });
  });

  describe('encrypt-on-write boundary', () => {
    beforeEach(() => {
      const row = {
        id: 'existing-id',
        organizationId: orgId,
        brandId,
        platform: 'TWITTER',
        isConnected: true,
        isDeleted: false,
        externalId: null,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async (args) =>
        args.select
          ? Object.fromEntries(
              Object.keys(args.select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : row,
      );
    });
    const SECRET = 'plaintext-access-token';

    it('encrypts every secret field on create, leaving non-secrets intact', async () => {
      await service.create({
        accessToken: SECRET,
        accessTokenSecret: 'ats',
        oauthToken: 'ot',
        oauthTokenSecret: 'ots',
        refreshToken: 'rt',
        // Non-secret fields that must pass through untouched:
        oauthState: 'state-lookup-key',
        platform: 'twitter',
        isConnected: true,
      } as never);

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        string
      >;

      for (const field of [
        'accessToken',
        'accessTokenSecret',
        'oauthToken',
        'oauthTokenSecret',
        'refreshToken',
      ]) {
        expect(data[field]).toMatch(CIPHERTEXT_PATTERN);
      }
      expect(crypto.decrypt(data.accessToken)).toBe(SECRET);

      // oauthState is a callback lookup key — must remain plaintext.
      expect(data.oauthState).toBe('state-lookup-key');
      // BaseService normalizes enum scalars app-form → Prisma-form at the write
      // boundary (CredentialPlatform 'twitter' → schema enum 'TWITTER'), so the
      // value persisted to the enum column is upper-case. Encryption still leaves
      // this non-secret field otherwise untouched.
      expect(data.platform).toBe('TWITTER');
      expect(data.isConnected).toBe(true);
    });

    it('encrypts secrets on patch', async () => {
      await service.patch('existing-id', { refreshToken: 'rt-raw' });

      const data = prisma.credential.update.mock.calls[0][0].data as Record<
        string,
        string
      >;
      expect(data.refreshToken).toMatch(CIPHERTEXT_PATTERN);
      expect(crypto.decrypt(data.refreshToken)).toBe('rt-raw');
    });

    it('encrypts secrets on patchAll', async () => {
      const result = await service.patchAll(
        { platform: 'twitter' },
        { accessToken: 'bulk-raw' },
      );

      const data = prisma.credential.updateMany.mock.calls[0][0].data as Record<
        string,
        string
      >;
      expect(data.accessToken).toMatch(CIPHERTEXT_PATTERN);
      expect(crypto.decrypt(data.accessToken)).toBe('bulk-raw');
      expect(result.modifiedCount).toBe(1);
    });

    it('is idempotent — does not double-encrypt an already-encrypted value', async () => {
      const preEncrypted = crypto.encrypt('already-secret');

      await service.create({ accessToken: preEncrypted } as never);

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        string
      >;
      expect(data.accessToken).toBe(preEncrypted);
      expect(crypto.decrypt(data.accessToken)).toBe('already-secret');
    });

    it('never writes or logs the plaintext secret', async () => {
      await service.create({ accessToken: SECRET } as never);

      const writtenData = JSON.stringify(
        prisma.credential.create.mock.calls[0][0],
      );
      expect(writtenData).not.toContain(SECRET);

      const allLogArgs = JSON.stringify([
        ...logger.debug.mock.calls,
        ...logger.log.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls,
      ]);
      expect(allLogArgs).not.toContain(SECRET);
    });
  });

  describe('createPendingForBrand', () => {
    it('encrypts secrets when creating the pending credential', async () => {
      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
        { accessToken: 'save-raw' },
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        string
      >;
      expect(data.accessToken).toMatch(CIPHERTEXT_PATTERN);
      expect(crypto.decrypt(data.accessToken)).toBe('save-raw');
    });

    it('writes canonical credential relation IDs', async () => {
      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
        { accessToken: 'save-raw' },
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        string
      >;

      expect(data.brandId).toBe(brandId);
      expect(data.organizationId).toBe(orgId);
      expect(data.userId).toBe('u1');

      for (const key of ['brandId', 'organizationId', 'userId'] as const) {
        expect(data[key]).not.toBe('undefined');
        expect(data[key]).not.toBe('[object Object]');
      }
    });

    it('does not let provider fields override credential ownership or platform', async () => {
      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
        {
          accessToken: 'save-raw',
          brandId: 'foreign-brand',
          organizationId: 'foreign-org',
          platform: 'facebook',
          userId: 'foreign-user',
        } as never,
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        string
      >;

      expect(data.brandId).toBe(brandId);
      expect(data.organizationId).toBe(orgId);
      expect(data.platform).toBe('TWITTER');
      expect(data.userId).toBe('u1');
    });

    it('fails closed rather than writing an unresolvable foreign key', async () => {
      await expect(
        service.createPendingForBrand(
          { id: brandId } as never,
          'u1',
          'twitter' as never,
          { accessToken: 'save-raw' },
        ),
      ).rejects.toThrow(/organization/);

      expect(prisma.credential.create).not.toHaveBeenCalled();
    });

    it('always creates an unidentified, unconnected row', async () => {
      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
        { isConnected: true, externalId: 'guessed-id' } as never,
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;

      expect(data.externalId).toBeNull();
      expect(data.isConnected).toBe(false);
    });

    it('never reads a connected credential to reuse at connect time', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        externalId: 'live-account',
        id: 'live-credential',
        isConnected: true,
        organizationId: orgId,
        platform: 'TWITTER',
      });

      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
      );

      expect(prisma.credential.create).toHaveBeenCalledOnce();
      expect(prisma.credential.update).not.toHaveBeenCalled();
    });

    it('reaps only the caller own abandoned attempts for this brand and platform', async () => {
      await service.createPendingForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
      );

      expect(prisma.credential.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true, oauthState: null, oauthToken: null },
        where: {
          brandId,
          externalId: null,
          isConnected: false,
          isDeleted: false,
          organizationId: orgId,
          platform: 'TWITTER',
          updatedAt: { lt: expect.any(Date) },
          userId: 'u1',
        },
      });
    });
  });

  describe('findConnectedAccounts', () => {
    it('returns every live connected account on a platform, oldest first', async () => {
      prisma.credential.findMany.mockResolvedValue([
        {
          createdAt: '2026-02-01T00:00:00.000Z',
          externalId: 'account-b',
          id: 'cred-b',
          platform: 'TWITTER',
        },
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          externalId: 'account-a',
          id: 'cred-a',
          platform: 'TWITTER',
        },
      ]);

      const accounts = await service.findConnectedAccounts(
        orgId,
        brandId,
        'twitter' as never,
      );

      expect(accounts.map((account) => account.id)).toEqual([
        'cred-a',
        'cred-b',
      ]);
      expect(prisma.credential.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId,
            isConnected: true,
            isDeleted: false,
            organizationId: orgId,
            platform: 'TWITTER',
          }),
        }),
      );
    });
  });

  describe('resolveBrandAccount', () => {
    it('returns the named account without listing the platform', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        brandId,
        id: 'cred-b',
        organizationId: orgId,
        platform: 'TWITTER',
      });

      const account = await service.resolveBrandAccount({
        brandId,
        credentialId: 'cred-b',
        organizationId: orgId,
        platform: 'twitter' as never,
      });

      expect(account?.id).toBe('cred-b');
      // An explicit id is the whole point of multi-account addressing: the
      // brand-wide list must never be consulted, or a sibling could win.
      expect(prisma.credential.findMany).not.toHaveBeenCalled();
    });

    it('refuses a named account that belongs to another brand or platform', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        brandId: 'another-brand',
        id: 'cred-x',
        organizationId: orgId,
        platform: 'TWITTER',
      });

      const account = await service.resolveBrandAccount({
        brandId,
        credentialId: 'cred-x',
        organizationId: orgId,
        platform: 'twitter' as never,
      });

      expect(account).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not belong'),
        expect.objectContaining({ credentialId: 'cred-x' }),
      );
    });

    it('resolves the brand default when only one account is connected', async () => {
      prisma.credential.findMany.mockResolvedValue([
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          externalId: 'ext-a',
          id: 'cred-a',
          platform: 'TWITTER',
        },
      ]);

      const account = await service.resolveBrandAccount({
        brandId,
        organizationId: orgId,
        platform: 'twitter' as never,
      });

      expect(account?.id).toBe('cred-a');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('picks the oldest account and warns when the brand holds several', async () => {
      prisma.credential.findMany.mockResolvedValue([
        {
          createdAt: '2026-02-01T00:00:00.000Z',
          externalId: 'ext-b',
          id: 'cred-b',
          platform: 'TWITTER',
        },
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          externalId: 'ext-a',
          id: 'cred-a',
          platform: 'TWITTER',
        },
      ]);

      const account = await service.resolveBrandAccount({
        brandId,
        organizationId: orgId,
        platform: 'twitter' as never,
      });

      // Deterministic rather than "whatever the database returned first", and
      // loud enough that the implicit pick shows up in operator logs.
      expect(account?.id).toBe('cred-a');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('2 twitter accounts'),
        expect.objectContaining({ brandId, credentialId: 'cred-a' }),
      );
    });

    it('returns null when the brand has no connected account', async () => {
      prisma.credential.findMany.mockResolvedValue([]);

      await expect(
        service.resolveBrandAccount({
          brandId,
          organizationId: orgId,
          platform: 'twitter' as never,
        }),
      ).resolves.toBeNull();
    });

    it('never falls back to a row with no externalId, even as the sole candidate', async () => {
      // A row with no externalId was never resolved to a specific account —
      // an abandoned multi-account selection, or a pending row mid-OAuth. It
      // has nothing this call could correctly act "as".
      prisma.credential.findMany.mockResolvedValue([
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          externalId: null,
          id: 'cred-unidentified',
          platform: 'INSTAGRAM',
        },
      ]);

      await expect(
        service.resolveBrandAccount({
          brandId,
          organizationId: orgId,
          platform: 'instagram' as never,
        }),
      ).resolves.toBeNull();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('skips unidentified rows and falls back to the one identified account', async () => {
      prisma.credential.findMany.mockResolvedValue([
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          externalId: null,
          id: 'cred-unidentified',
          platform: 'INSTAGRAM',
        },
        {
          createdAt: '2026-02-01T00:00:00.000Z',
          externalId: 'ext-a',
          id: 'cred-identified',
          platform: 'INSTAGRAM',
        },
      ]);

      const account = await service.resolveBrandAccount({
        brandId,
        organizationId: orgId,
        platform: 'instagram' as never,
      });

      expect(account?.id).toBe('cred-identified');
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('account identity reconciliation', () => {
    const pendingCredential = {
      accessToken: 'fresh-token',
      brandId,
      externalId: null,
      id: 'pending-1',
      isConnected: false,
      organizationId: orgId,
      platform: 'TWITTER',
    };

    function loadPendingCredential(): void {
      useStoredRows([{ ...pendingCredential, isDeleted: false }]);
    }

    function useStoredRows(rows: Array<Record<string, unknown>>) {
      const matches = (
        row: Record<string, unknown>,
        where: Record<string, unknown>,
      ): boolean =>
        Object.entries(where).every(([key, value]) => {
          if (key === 'AND')
            return (value as Array<Record<string, unknown>>).every(
              (condition) => matches(row, condition),
            );
          if (key === 'OR')
            return (value as Array<Record<string, unknown>>).some((condition) =>
              matches(row, condition),
            );
          if (value && typeof value === 'object' && 'not' in value)
            return row[key] !== value.not;
          return row[key] === value;
        });
      prisma.credential.findFirst.mockImplementation(
        async ({
          where,
          select,
        }: {
          where: Record<string, unknown>;
          select?: Record<string, unknown>;
        }) => {
          const row = rows.find((candidate) => matches(candidate, where));
          return row
            ? select
              ? Object.fromEntries(
                  Object.keys(select).map((key) => [key, row[key]]),
                )
              : { ...row }
            : null;
        },
      );
      prisma.credential.findMany.mockImplementation(
        async ({
          where,
          select,
        }: {
          where: Record<string, unknown>;
          select?: Record<string, unknown>;
        }) =>
          rows
            .filter((row) => matches(row, where))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map((row) =>
              select
                ? Object.fromEntries(
                    Object.keys(select).map((key) => [key, row[key]]),
                  )
                : { ...row },
            ),
      );
      prisma.credential.updateMany.mockImplementation(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const matched = rows.filter((row) => matches(row, where));
          for (const row of matched) Object.assign(row, data);
          return { count: matched.length };
        },
      );
      prisma.credential.update.mockImplementation(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const row = rows.find((candidate) => matches(candidate, where));
          if (!row) throw new Error('Missing live row');
          Object.assign(row, data);
          return { ...row };
        },
      );
      let previous = Promise.resolve();
      prisma.$transaction.mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          const next = previous.then(async () => {
            const snapshot = rows.map((row) => ({ ...row }));
            try {
              return await callback(prisma);
            } catch (error) {
              rows.forEach((row, index) => {
                for (const key of Object.keys(row)) delete row[key];
                Object.assign(row, snapshot[index]);
              });
              throw error;
            }
          });
          previous = next.then(
            () => undefined,
            () => undefined,
          );
          return next;
        },
      );
    }

    it.each([
      'FACEBOOK',
      'LINKEDIN',
      'REDDIT',
      'TWITTER',
      'YOUTUBE',
      'INSTAGRAM',
    ])(
      'settles token-first %s callbacks and repeats the same identity',
      async (platform) => {
        const row = {
          ...pendingCredential,
          accessToken: crypto.encrypt('stored-token'),
          isConnected: true,
          isDeleted: false,
          platform,
        };
        useStoredRows([row]);
        const first = await service.updateExternalProfile(row.id, orgId, {
          id: 'verified-account',
          handle: 'first',
        });
        const second = await service.updateExternalProfile(row.id, orgId, {
          id: 'verified-account',
          handle: 'refreshed',
        });
        expect(first).toMatchObject({
          id: row.id,
          externalId: 'verified-account',
          isConnected: true,
        });
        expect(second).toMatchObject({
          id: row.id,
          externalHandle: 'refreshed',
          accessToken: row.accessToken,
        });
        expect(crypto.decrypt(row.accessToken)).toBe('stored-token');
      },
    );

    it.each(['missing', 'foreign', 'deleted'])(
      'never writes a %s source from a stale callback',
      async (state) => {
        const row = {
          ...pendingCredential,
          isDeleted: state === 'deleted',
          organizationId: state === 'foreign' ? 'other-org' : orgId,
        };
        useStoredRows(state === 'missing' ? [] : [row]);
        await expect(
          service.connectAccount(
            row.id,
            orgId,
            { id: 'account-1' },
            { accessToken: 'incoming-token' },
          ),
        ).rejects.toThrow(/not found/);
        expect(prisma.credential.updateMany).not.toHaveBeenCalled();
        expect(prisma.credential.update).not.toHaveBeenCalled();
        expect(row.accessToken).toBe('fresh-token');
      },
    );

    it('rejects different identity without changing profile, token, or OAuth state', async () => {
      const row = {
        ...pendingCredential,
        externalId: 'held-account',
        isDeleted: false,
        oauthState: 'pending-state',
        externalHandle: 'held',
        accessToken: crypto.encrypt('working-token'),
      };
      useStoredRows([row]);
      const before = { ...row };
      await expect(
        service.connectAccount(
          row.id,
          orgId,
          { id: 'different-account', handle: 'different' },
          { accessToken: 'incoming-token' },
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { title: 'Already Connected' },
      });
      expect(row).toEqual(before);
      expect(prisma.credential.update).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'serializes conflicting selections before incumbent mutation (incumbent=%s)',
      async (hasIncumbent) => {
        const row = {
          ...pendingCredential,
          isDeleted: false,
          accessToken: crypto.encrypt('original-token'),
        };
        const incumbent = {
          ...row,
          id: 'incumbent-2',
          externalId: 'account-2',
          accessToken: crypto.encrypt('incumbent-token'),
        };
        const incumbentBefore = { ...incumbent };
        useStoredRows(hasIncumbent ? [row, incumbent] : [row]);
        const results = await Promise.allSettled([
          service.connectAccount(
            row.id,
            orgId,
            { id: 'account-1' },
            { accessToken: 'winning-token' },
          ),
          service.connectAccount(
            row.id,
            orgId,
            { id: 'account-2' },
            { accessToken: 'losing-token' },
          ),
        ]);
        expect(results.map((result) => result.status)).toEqual([
          'fulfilled',
          'rejected',
        ]);
        expect(row.externalId).toBe('account-1');
        expect(crypto.decrypt(row.accessToken)).toBe('winning-token');
        expect(incumbent).toEqual(incumbentBefore);
      },
    );

    it('uses the current locked connection rather than the pre-lock snapshot', async () => {
      const row = {
        ...pendingCredential,
        isDeleted: false,
        accessToken: crypto.encrypt('current-token'),
      };
      const incumbent = { ...row, id: 'incumbent', externalId: 'account-1' };
      useStoredRows([row, incumbent]);
      prisma.credential.findFirst.mockResolvedValueOnce({
        ...row,
        accessToken: crypto.encrypt('stale-token'),
      });
      const result = await service.updateExternalProfile(row.id, orgId, {
        id: 'account-1',
      });
      expect(result.id).toBe('incumbent');
      expect(crypto.decrypt(incumbent.accessToken)).toBe('current-token');
      expect(row.accessToken).toBeNull();
    });

    it.each([
      { chosen: false, incumbentChoice: null, expected: false },
      { chosen: true, incumbentChoice: false, expected: true },
      { chosen: null, incumbentChoice: false, expected: false },
      { chosen: null, incumbentChoice: null, expected: null },
    ])(
      'settles the history-import choice onto the surviving account %j',
      async ({ chosen, incumbentChoice, expected }) => {
        const row = {
          ...pendingCredential,
          isDeleted: false,
          isHistoryImportRequested: chosen,
        };
        const incumbent = {
          ...row,
          id: 'incumbent',
          externalId: 'account-1',
          isHistoryImportRequested: incumbentChoice,
        };
        useStoredRows([row, incumbent]);

        const result = await service.updateExternalProfile(row.id, orgId, {
          id: 'account-1',
        });

        expect(result.id).toBe('incumbent');
        expect(incumbent.isHistoryImportRequested).toBe(expected);
      },
    );

    it.each([
      { organizationId: 'other-org' },
      { brandId: 'other-brand' },
      { platform: 'FACEBOOK' },
      { isDeleted: true },
    ])('never merges into an out-of-scope incumbent %j', async (scope) => {
      const row = { ...pendingCredential, isDeleted: false };
      const other = {
        ...row,
        id: 'unrelated',
        externalId: 'account-1',
        ...scope,
      };
      const before = { ...other };
      useStoredRows([row, other]);
      const result = await service.connectAccount(
        row.id,
        orgId,
        { id: 'account-1' },
        { accessToken: 'incoming-token' },
      );
      expect(result.id).toBe(row.id);
      expect(other).toEqual(before);
      expect(result.accessToken).toMatch(CIPHERTEXT_PATTERN);
      expect(crypto.decrypt(result.accessToken as string)).toBe(
        'incoming-token',
      );
    });

    it('rolls back incoming encrypted token and OAuth state when persistence fails', async () => {
      const row = {
        ...pendingCredential,
        isDeleted: false,
        oauthState: 'pending-state',
      };
      useStoredRows([row]);
      const before = { ...row };
      prisma.credential.update.mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      await expect(
        service.connectAccount(
          row.id,
          orgId,
          { id: 'account-1' },
          { accessToken: 'incoming-token' },
        ),
      ).rejects.toThrow('database unavailable');
      expect(row).toEqual(before);
      const data = prisma.credential.update.mock.calls[0][0].data;
      expect(data.accessToken).toMatch(CIPHERTEXT_PATTERN);
      expect(data.externalId).toBe('account-1');
    });

    it('rejects a connection the provider never identified', async () => {
      loadPendingCredential();

      await expect(
        service.updateExternalProfile('pending-1', orgId, {
          handle: 'nameless',
        }),
      ).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining('did not identify which account'),
        },
      });

      expect(prisma.credential.update).not.toHaveBeenCalled();
    });

    it('claims the identity when the brand holds no account with it', async () => {
      loadPendingCredential();

      await service.updateExternalProfile('pending-1', orgId, {
        handle: 'second_account',
        id: 'account-2',
      });

      expect(prisma.credential.updateMany).toHaveBeenCalledWith({
        data: { oauthState: null },
        where: {
          id: 'pending-1',
          isDeleted: false,
          organizationId: orgId,
          OR: [{ externalId: null }, { externalId: 'account-2' }],
        },
      });
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalId: 'account-2',
            isConnected: true,
            oauthState: null,
          }),
        }),
      );
    });

    it('rejects the losing writer of a concurrent claim on the same pending row', async () => {
      // Two concurrent select-account requests choosing *different*
      // accounts never collide on the externalId unique constraint (only
      // the P2002 path above covers that), so the only thing that can stop
      // the second writer from silently overwriting the first's claim is
      // this row-state precondition. Simulate the second writer losing the
      // race: updateMany matches zero rows because the first writer already
      // flipped isConnected/externalId.
      loadPendingCredential();
      prisma.credential.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateExternalProfile('pending-1', orgId, {
          handle: 'second_account',
          id: 'account-2',
        }),
      ).rejects.toMatchObject({
        response: {
          title: 'Already Connected',
        },
        status: 400,
      });
    });

    it('merges into the incumbent and retires the pending row on reconnect', async () => {
      loadPendingCredential();
      useStoredRows([
        { ...pendingCredential, isDeleted: false },
        {
          ...pendingCredential,
          id: 'incumbent-1',
          externalId: 'account-1',
          isDeleted: false,
        },
      ]);

      await service.updateExternalProfile('pending-1', orgId, {
        handle: 'same_account',
        id: 'account-1',
      });

      const [survivorUpdate, retirementUpdate] =
        prisma.credential.update.mock.calls.map(
          (call) =>
            call[0] as { data: Record<string, unknown>; where: unknown },
        );

      expect(survivorUpdate.where).toEqual({
        id: 'incumbent-1',
        isDeleted: false,
        organizationId: orgId,
      });
      expect(survivorUpdate.data).toEqual(
        expect.objectContaining({
          accessToken: 'fresh-token',
          externalId: 'account-1',
          isConnected: true,
        }),
      );

      expect(retirementUpdate.where).toEqual({
        id: 'pending-1',
        isDeleted: false,
        organizationId: orgId,
      });
      expect(retirementUpdate.data).toEqual(
        expect.objectContaining({
          isConnected: false,
          isDeleted: true,
          oauthState: null,
          accessToken: null,
          refreshToken: null,
          oauthToken: null,
          oauthTokenSecret: null,
          oauthTokenHash: null,
          accessTokenSecret: null,
        }),
      );
    });

    it('folds into the winner when a concurrent verify claimed the identity first', async () => {
      const rows: Array<Record<string, unknown>> = [
        { ...pendingCredential, isDeleted: false },
      ];
      useStoredRows(rows);
      const settle = prisma.$transaction.getMockImplementation();
      prisma.$transaction.mockImplementation((callback) => {
        if (prisma.$transaction.mock.calls.length === 2)
          rows.push({
            ...pendingCredential,
            id: 'winner-1',
            externalId: 'account-1',
            isDeleted: false,
          });
        return settle?.(callback);
      });
      prisma.credential.update.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const survivor = await service.updateExternalProfile('pending-1', orgId, {
        id: 'account-1',
      });

      expect(survivor.id).toBe('winner-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.credential.update.mock.calls.at(-1)?.[0]).toEqual({
        data: expect.objectContaining({
          isConnected: false,
          isDeleted: true,
          oauthState: null,
          accessToken: null,
        }),
        where: {
          id: 'pending-1',
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('rethrows a unique violation when no winner can be found', async () => {
      loadPendingCredential();
      prisma.credential.update.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(
        service.updateExternalProfile('pending-1', orgId, { id: 'account-1' }),
      ).rejects.toThrow(/Unique constraint failed/);
    });

    it('reconnects a soft-deleted account without treating it as an incumbent', async () => {
      loadPendingCredential();

      await service.updateExternalProfile('pending-1', orgId, {
        id: 'account-1',
      });

      const incumbentLookup = prisma.credential.findMany.mock.calls.find(
        (call) => call[0].where.OR,
      )?.[0] as { where: Record<string, unknown> };
      expect(incumbentLookup.where.isDeleted).toBe(false);
      expect(incumbentLookup.where.organizationId).toBe(orgId);
    });

    it('persists encrypted connection fields with the settled identity', async () => {
      loadPendingCredential(); // updateExternalProfile reads the pending row

      await service.connectAccount(
        'pending-1',
        orgId,
        { id: 'account-1' },
        { accessToken: 'exchanged-token' },
      );

      const tokenUpdate = prisma.credential.update.mock.calls[0][0] as {
        data: Record<string, string>;
      };

      expect(crypto.decrypt(tokenUpdate.data.accessToken)).toBe(
        'exchanged-token',
      );
      expect(tokenUpdate.data.oauthState).toBeNull();
    });
  });

  describe('OAuth state', () => {
    it('stores an opaque state nonce on the pending credential', async () => {
      const result = await service.beginOAuthForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        'twitter' as never,
        { isConnected: false },
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;

      expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.oauthState).toBe(result.state);
      expect(result.state).not.toContain(brandId);
      expect(result.state).not.toContain(orgId);
    });

    it('stores a reconnect intent on the pending credential, never in the OAuth state', async () => {
      const result = await service.beginOAuthForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        CredentialPlatform.INSTAGRAM,
        { isConnected: false },
        'reconnect-credential-1',
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;

      // The state stays a plain, unstructured nonce: it round-trips through
      // the provider's authorization URL, browser history, and referrer
      // headers, so embedding a credential id in it would leak that
      // internal identifier outside Genfeed.
      expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.state).not.toContain('reconnect-credential-1');
      expect(data.oauthState).toBe(result.state);
      expect(data.warmupSignals).toEqual({
        oauthConnectIntent: { reconnectCredentialId: 'reconnect-credential-1' },
      });
      expect(
        extractReconnectCredentialIdFromWarmupSignals(data.warmupSignals),
      ).toBe('reconnect-credential-1');
    });

    it('reuses a pending connection id instead of creating another credential', async () => {
      const row = {
        brandId,
        id: 'pending-1',
        isConnected: false,
        organizationId: orgId,
        platform: 'TWITTER',
        userId: 'u1',
        isDeleted: false,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async ({ select }) =>
        select
          ? Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : { ...row },
      );
      prisma.credential.update.mockResolvedValue({
        brandId,
        id: 'pending-1',
        isConnected: false,
        oauthState: 'new-state',
      });

      const result = await service.beginOAuthForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        CredentialPlatform.TWITTER,
        { isConnected: false },
        'pending-1',
      );

      expect(prisma.credential.create).not.toHaveBeenCalled();
      expect(result.credential.id).toBe('pending-1');
      expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('omits the intent entirely when no reconnect credential is given', async () => {
      await service.beginOAuthForBrand(
        { id: brandId, organizationId: orgId },
        'u1',
        CredentialPlatform.INSTAGRAM,
        { isConnected: false },
      );

      const data = prisma.credential.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;

      expect(data.warmupSignals).toBeUndefined();
      expect(
        extractReconnectCredentialIdFromWarmupSignals(data.warmupSignals),
      ).toBeUndefined();
    });

    it('recovers no reconnect intent from warmupSignals that carry none', () => {
      expect(
        extractReconnectCredentialIdFromWarmupSignals({
          instagramAuthorized: {},
        }),
      ).toBeUndefined();
      expect(
        extractReconnectCredentialIdFromWarmupSignals(undefined),
      ).toBeUndefined();
      expect(
        extractReconnectCredentialIdFromWarmupSignals({
          oauthConnectIntent: { reconnectCredentialId: '   ' },
        }),
      ).toBeUndefined();
    });

    it('resolves pending OAuth state inside the caller tenant scope', async () => {
      prisma.credential.findFirst.mockResolvedValueOnce({
        brandId,
        id: 'credential-1',
        organizationId: orgId,
        userId: 'u1',
      });

      const credential = await service.findPendingOAuthCredential(
        'opaque-state',
        'twitter' as never,
        { organizationId: orgId, userId: 'u1' },
      );

      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        where: {
          isConnected: false,
          isDeleted: false,
          oauthState: 'opaque-state',
          organizationId: orgId,
          platform: 'TWITTER',
          updatedAt: { gte: expect.any(Date) },
          userId: 'u1',
        },
      });
      expect(credential).toEqual(
        expect.objectContaining({ id: 'credential-1' }),
      );
    });

    it('rejects an empty OAuth state without querying credentials', async () => {
      await expect(
        service.findPendingOAuthCredential('  ', 'twitter' as never, {
          organizationId: orgId,
        }),
      ).resolves.toBeNull();

      expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    });

    it('rejects reserved denied/failed sentinels so they cannot resume OAuth', async () => {
      await expect(
        service.findPendingOAuthCredential('denied', 'twitter' as never, {
          organizationId: orgId,
        }),
      ).resolves.toBeNull();
      await expect(
        service.findPendingOAuthCredential(
          'failed',
          CredentialPlatform.FACEBOOK,
          {
            organizationId: orgId,
          },
        ),
      ).resolves.toBeNull();

      expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    });

    it('resolves an OAuth 1.0a request token by hash inside the caller scope', async () => {
      prisma.credential.findFirst.mockResolvedValueOnce({
        brandId,
        id: 'credential-1',
        organizationId: orgId,
        userId: 'u1',
      });

      const credential = await service.findPendingOAuth1Credential(
        'request-token',
        'x-ads' as never,
        { organizationId: orgId, userId: 'u1' },
      );

      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        where: {
          isConnected: false,
          isDeleted: false,
          oauthTokenHash:
            '3dc30238bf4b801c0cb801511cfdda3a9a9d767f737068df3f5f76c3a32a8eac',
          organizationId: orgId,
          platform: 'X_ADS',
          updatedAt: { gte: expect.any(Date) },
          userId: 'u1',
        },
      });
      expect(credential).toEqual(
        expect.objectContaining({ id: 'credential-1' }),
      );
    });

    it('stores the OAuth 1.0a request token encrypted with a lookup hash', async () => {
      const row = {
        id: 'credential-1',
        organizationId: orgId,
        brandId,
        userId: 'u1',
        platform: 'X_ADS',
        isConnected: false,
        isDeleted: false,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async ({ select }) =>
        select
          ? Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : { ...row },
      );
      await service.attachOAuth1RequestToken(
        'credential-1',
        'x-ads' as never,
        { organizationId: orgId, userId: 'u1' },
        'request-token',
        'request-token-secret',
      );

      const update = prisma.credential.updateMany.mock.calls[0][0];
      const data = update.data as Record<string, string>;
      expect(update.where).toEqual({
        AND: [
          {
            id: 'credential-1',
            isConnected: false,
            isDeleted: false,
            organizationId: orgId,
            platform: 'X_ADS',
            userId: 'u1',
          },
          { id: 'credential-1', organizationId: orgId, isDeleted: false },
        ],
      });
      expect(data.oauthTokenHash).toBe(
        '3dc30238bf4b801c0cb801511cfdda3a9a9d767f737068df3f5f76c3a32a8eac',
      );
      expect(crypto.decrypt(data.oauthToken)).toBe('request-token');
      expect(crypto.decrypt(data.oauthTokenSecret)).toBe(
        'request-token-secret',
      );
    });

    it('fails when the pending credential is outside the caller scope', async () => {
      prisma.credential.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.attachOAuth1RequestToken(
          'foreign-credential',
          'x-ads' as never,
          { organizationId: orgId, userId: 'u1' },
          'request-token',
          'request-token-secret',
        ),
      ).rejects.toThrow('Pending credential');
    });
  });

  describe('credential tags', () => {
    it('creates and attaches a tenant-scoped tag atomically', async () => {
      prisma.credential.findFirst.mockResolvedValueOnce({
        brandId,
        id: 'credential-1',
      });

      await service.createAndAttachTag('credential-1', orgId, 'user-1', {
        label: 'Creator',
      } as never);

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        select: { brandId: true, id: true },
        where: {
          id: 'credential-1',
          isDeleted: false,
          organizationId: orgId,
        },
      });
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandId,
            label: 'Creator',
            organizationId: orgId,
            userId: 'user-1',
          }),
        }),
      );
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tags: { connect: { id: 'tag-1' } } },
          where: {
            id: 'credential-1',
            isDeleted: false,
            organizationId: orgId,
          },
        }),
      );
    });

    it('does not create a tag for a foreign credential', async () => {
      prisma.credential.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createAndAttachTag('credential-1', 'foreign-org', 'user-1', {
          label: 'Creator',
        } as never),
      ).rejects.toThrow(/Credential/);

      expect(prisma.tag.create).not.toHaveBeenCalled();
      expect(prisma.credential.update).not.toHaveBeenCalled();
    });
  });

  describe('updateExternalProfile', () => {
    beforeEach(() => {
      const row = {
        brandId,
        externalId: 'provider-1',
        id: 'existing-id',
        organizationId: orgId,
        platform: 'TWITTER',
        isConnected: true,
        isDeleted: false,
      };
      prisma.credential.findMany.mockResolvedValue([row]);
      prisma.credential.findFirst.mockImplementation(async (args) =>
        args.select
          ? Object.fromEntries(
              Object.keys(args.select).map((key) => [
                key,
                row[key as keyof typeof row],
              ]),
            )
          : row,
      );
    });

    it('uploads a provider avatar to S3 and persists public identity', async () => {
      await service.updateExternalProfile('existing-id', orgId, {
        avatarUrl: 'https://platform.example/avatar.jpg',
        handle: 'acme',
        id: 'provider-1',
        name: 'Acme Studio',
      });

      expect(filesClient.uploadToS3).toHaveBeenCalledWith(
        'existing-id',
        'social-avatars',
        {
          type: 'url',
          url: 'https://platform.example/avatar.jpg',
        },
      );
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalAvatar:
              'https://cdn.genfeed.ai/ingredients/social-avatars/existing-id',
            externalHandle: 'acme',
            externalId: 'provider-1',
            externalName: 'Acme Studio',
          }),
        }),
      );
    });

    it('clears a stale handle when a provider explicitly reports none', async () => {
      // `null` means "this provider has no handle for this account" and
      // must clear a previously-persisted bad value (see #4695); `undefined`
      // means "leave the column as is" and must not touch it.
      await service.updateExternalProfile('existing-id', orgId, {
        handle: null,
        id: 'provider-1',
        name: 'Acme Studio',
      });

      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalHandle: null }),
        }),
      );
    });

    it('leaves externalHandle untouched when the provider omits it', async () => {
      await service.updateExternalProfile('existing-id', orgId, {
        id: 'provider-1',
        name: 'Acme Studio',
      });

      const call = (prisma.credential.update as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('externalHandle');
    });

    it('rejects private avatar URLs before the files service fetches them', async () => {
      await service.updateExternalProfile('existing-id', orgId, {
        avatarUrl: 'http://127.0.0.1/avatar.jpg',
        handle: 'acme',
      });

      expect(filesClient.uploadToS3).not.toHaveBeenCalled();
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalHandle: 'acme' }),
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to import credential avatar',
        expect.objectContaining({ credentialId: 'existing-id' }),
      );
    });

    it('rejects cross-org profile updates before upload or persistence', async () => {
      prisma.credential.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateExternalProfile('existing-id', 'foreign-org', {
          avatarUrl: 'https://platform.example/avatar.jpg',
          handle: 'acme',
        }),
      ).rejects.toThrow('Credential existing-id not found');

      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'existing-id',
          isDeleted: false,
          organizationId: 'foreign-org',
        },
      });
      expect(filesClient.uploadToS3).not.toHaveBeenCalled();
      expect(prisma.credential.update).not.toHaveBeenCalled();
    });

    it('does not mirror a provider default avatar', async () => {
      await service.updateExternalProfile('existing-id', orgId, {
        avatarUrl:
          'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        id: 'provider-1',
      });

      expect(filesClient.uploadToS3).not.toHaveBeenCalled();
    });

    it('preserves the previous avatar when S3 import fails', async () => {
      filesClient.uploadToS3.mockRejectedValue(new Error('files unavailable'));

      await service.updateExternalProfile('existing-id', orgId, {
        avatarUrl: 'https://platform.example/avatar.jpg',
        name: 'Acme Studio',
      });

      const data = prisma.credential.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('externalAvatar');
      expect(data.externalName).toBe('Acme Studio');
    });

    describe('brand asset autofill event', () => {
      beforeEach(() => {
        prisma.credential.update.mockImplementation(
          (args: { data: Record<string, unknown> }) =>
            Promise.resolve({
              brandId,
              id: 'existing-id',
              organizationId: orgId,
              platform: 'TWITTER',
              userId: 'user-1',
              ...args.data,
            }),
        );
      });

      it('hands the provider avatar and banner to brand autofill', async () => {
        await service.updateExternalProfile('existing-id', orgId, {
          avatarUrl: 'https://platform.example/avatar.jpg',
          bannerUrl: 'https://platform.example/banner.jpg',
          id: 'provider-1',
        });

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          CREDENTIAL_PROFILE_SYNCED_EVENT,
          {
            avatarUrl: 'https://platform.example/avatar.jpg',
            bannerUrl: 'https://platform.example/banner.jpg',
            brandId,
            credentialId: 'existing-id',
            organizationId: orgId,
            platform: 'twitter',
            userId: 'user-1',
          },
        );
      });

      it('stays quiet when the provider reports no profile media', async () => {
        await service.updateExternalProfile('existing-id', orgId, {
          id: 'provider-1',
          name: 'Acme Studio',
        });

        expect(eventEmitter.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('connected channels', () => {
    const connectedCredentialDto = {
      brandId,
      isConnected: true,
      organizationId: orgId,
      platform: 'twitter',
      userId: 'u1',
    };

    it('creates connected credentials without product-plan channel caps', async () => {
      await expect(
        service.create(connectedCredentialDto as never),
      ).resolves.toMatchObject({ id: 'new-id' });
      expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
      expect(prisma.credential.count).not.toHaveBeenCalled();
    });

    it('patches connected credentials without consuming channel quota', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        id: 'existing-id',
        isConnected: true,
        isDeleted: false,
        organizationId: orgId,
      });

      prisma.credential.findMany.mockResolvedValue([
        {
          id: 'existing-id',
          isConnected: true,
          isDeleted: false,
          organizationId: orgId,
          brandId,
          platform: 'TWITTER',
        },
      ]);
      await expect(
        service.patch('existing-id', { isConnected: true }),
      ).resolves.toMatchObject({ id: 'existing-id' });
      expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
      expect(prisma.credential.count).not.toHaveBeenCalled();
    });
  });
  describe('atomic credential learning mutations', () => {
    function storedRows(
      rows: Record<string, unknown>[],
      accounts: Record<string, unknown>[] = [],
    ) {
      const matches = (
        row: Record<string, unknown>,
        where: Record<string, unknown>,
      ): boolean =>
        Object.entries(where).every(([key, value]) => {
          if (key === 'AND')
            return (value as Record<string, unknown>[]).every((condition) =>
              matches(row, condition),
            );
          if (key === 'OR')
            return (value as Record<string, unknown>[]).some((condition) =>
              matches(row, condition),
            );
          if (value && typeof value === 'object' && 'not' in value)
            return row[key] !== value.not;
          return row[key] === value;
        });
      const project = (
        row: Record<string, unknown>,
        select?: Record<string, unknown>,
      ) =>
        select
          ? Object.fromEntries(
              Object.keys(select).map((key) => [key, row[key]]),
            )
          : { ...row };
      prisma.credential.findMany.mockImplementation(async ({ where, select }) =>
        rows
          .filter((row) => matches(row, where))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .map((row) => project(row, select)),
      );
      prisma.credential.findFirst.mockImplementation(
        async ({ where, select }) => {
          const row = rows.find((row) => matches(row, where));
          return row ? project(row, select) : null;
        },
      );
      prisma.credential.update.mockImplementation(async ({ where, data }) => {
        const row = rows.find((row) => matches(row, where));
        if (!row) throw new Error('stale row');
        Object.assign(row, data);
        return { ...row };
      });
      prisma.credential.updateMany.mockImplementation(
        async ({ where, data }) => {
          const selected = rows.filter((row) => matches(row, where));
          selected.forEach((row) => {
            Object.assign(row, data);
          });
          return { count: selected.length };
        },
      );
      prisma.contentLearningAccount.findMany.mockImplementation(
        async ({ where, select }) =>
          accounts
            .filter((row) => matches(row, where))
            .map((row) => project(row, select)),
      );
      prisma.contentLearningAccount.findFirst.mockImplementation(
        async ({ where }) =>
          accounts.find((row) => matches(row, where)) ?? null,
      );
      prisma.contentLearningAccount.updateMany.mockImplementation(
        async ({ where, data }) => {
          const row = accounts.find((row) => matches(row, where));
          if (!row) return { count: 0 };
          row.evidenceRevision =
            Number(row.evidenceRevision) + data.evidenceRevision.increment;
          return { count: 1 };
        },
      );
      prisma.$transaction.mockImplementation(async (callback) => {
        const before = structuredClone(rows),
          priorAccounts = structuredClone(accounts);
        try {
          return await callback(prisma);
        } catch (error) {
          rows.forEach((row, index) => {
            Object.assign(row, before[index]);
          });
          accounts.forEach((row, index) => {
            Object.assign(row, priorAccounts[index]);
          });
          throw error;
        }
      });
    }
    function credential(
      id: string,
      organizationId: string | null = orgId,
    ): Record<string, unknown> {
      return {
        id,
        organizationId,
        brandId,
        isDeleted: false,
        isConnected: true,
        platform: 'TWITTER',
        externalId: 'account',
        accessToken: null,
      };
    }
    function account(credentialId: string) {
      return {
        id: `learning-${credentialId}`,
        organizationId: orgId,
        brandId,
        credentialId,
        isDeleted: false,
        evidenceRevision: 0,
      };
    }
    it('encrypts unbound token patch and removes the exact null-org source without fabricated learning refs', async () => {
      const row = credential('unbound', null);
      storedRows([row]);
      await service.patch('unbound', { accessToken: 'secret' });
      expect(row.organizationId).toBeNull();
      expect(crypto.decrypt(row.accessToken as string)).toBe('secret');
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unbound', organizationId: null, isDeleted: false },
        }),
      );
      const sql = prisma.$queryRaw.mock.calls.map((call) =>
        Array.isArray(call[0]) ? call[0].join(' ') : call[0].strings.join(' '),
      );
      expect(sql[0]).toContain('pg_advisory_xact_lock');
      expect(sql[1]).toContain('credentials');
      expect(prisma.contentLearningDependency.findMany).not.toHaveBeenCalled();
      expect(prisma.contentLearningAccount.updateMany).not.toHaveBeenCalled();
      await service.remove('unbound');
      expect(row.isDeleted).toBe(true);
      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).not.toHaveBeenCalled();
    });
    it('mixed bulk counts all selected rows but invalidates and advances only the bound account once', async () => {
      const bound = credential('bound'),
        unbound = credential('unbound', null),
        learning = account('bound');
      storedRows([bound, unbound], [learning]);
      const result = await service.patchAll(
        { OR: [{ id: 'bound' }, { id: 'unbound' }] },
        { isConnected: false },
      );
      expect(result.modifiedCount).toBe(2);
      expect(bound.isConnected).toBe(false);
      expect(unbound.isConnected).toBe(false);
      expect(learning.evidenceRevision).toBe(1);
      expect(prisma.contentLearningDependency.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(prisma.contentLearningDependency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceKind: 'credential',
            sourceId: 'bound',
            sourceOrganizationId: orgId,
            isDeleted: false,
          },
        }),
      );
      await service.patch('bound', {
        isConnected: false,
        refreshToken: 'token',
      });
      expect(learning.evidenceRevision).toBe(1);
    });
    it.each(['account', 'dependency'])(
      'unbound retained %s anomaly refuses the entire mixed mutation before any source write',
      async (anomaly) => {
        const bound = credential('bound'),
          unbound = credential('unbound', null);
        storedRows([bound, unbound]);
        if (anomaly === 'account')
          prisma.contentLearningAccount.findFirst.mockResolvedValue({
            id: 'foreign-binding',
          });
        else
          prisma.contentLearningDependency.findFirst.mockResolvedValue({
            id: 'deleted-invalid-edge',
          });
        await expect(
          service.patchAll(
            { OR: [{ id: 'bound' }, { id: 'unbound' }] },
            { isConnected: false },
          ),
        ).rejects.toThrow(/retained learning attachments/);
        expect(prisma.credential.updateMany).not.toHaveBeenCalled();
        expect(
          accessBootstrapCache.invalidateForOrganization,
        ).not.toHaveBeenCalled();
        expect(bound.isConnected).toBe(true);
      },
    );
    it('rolls back source eligibility when actual dependency or revision mutation fails', async () => {
      const row = credential('bound'),
        learning = account('bound');
      storedRows([row], [learning]);
      prisma.contentLearningDependency.findMany.mockRejectedValue(
        new Error('dependency failure'),
      );
      await expect(
        service.patch('bound', { isConnected: false }),
      ).rejects.toThrow('dependency failure');
      expect(row.isConnected).toBe(true);
      expect(learning.evidenceRevision).toBe(0);
      expect(
        accessBootstrapCache.invalidateForOrganization,
      ).not.toHaveBeenCalled();
    });
    it('rejects stale null-org binding and effective foreign tenant retarget before mutation', async () => {
      const row = credential('unbound', null);
      storedRows([row]);
      const read = prisma.credential.findMany.getMockImplementation();
      let calls = 0;
      prisma.credential.findMany.mockImplementation(async (args) => {
        if (++calls === 2) row.organizationId = orgId;
        return read?.(args);
      });
      await expect(
        service.patch('unbound', { isConnected: false }),
      ).rejects.toThrow(/discovery changed/);
      expect(prisma.credential.update).not.toHaveBeenCalled();
      expect(row.organizationId).toBeNull();
      prisma.credential.findMany.mockReset();
      storedRows([credential('bound')]);
      await expect(
        service.patch('bound', { organizationId: 'foreign' }),
      ).rejects.toThrow(/authorized brand relocation/);
      expect(prisma.credential.update).not.toHaveBeenCalled();
    });
    it.each(['second source', 'revision'])(
      'mixed bulk rolls back every selected row on %s failure',
      async (failure) => {
        const first = credential('a-bound'),
          last = credential('z-unbound', null),
          learning = account('a-bound');
        storedRows([first, last], [learning]);
        if (failure === 'revision')
          prisma.contentLearningAccount.updateMany.mockResolvedValue({
            count: 0,
          });
        else {
          const write = prisma.credential.updateMany.getMockImplementation();
          prisma.credential.updateMany.mockImplementation(async (args) => {
            if (prisma.credential.updateMany.mock.calls.length === 2)
              throw new Error('second source failed');
            return write?.(args);
          });
        }
        await expect(
          service.patchAll(
            { OR: [{ id: 'a-bound' }, { id: 'z-unbound' }] },
            { isConnected: false },
          ),
        ).rejects.toThrow(
          failure === 'revision' ? /account changed/ : 'second source failed',
        );
        expect(first.isConnected).toBe(true);
        expect(last.isConnected).toBe(true);
        expect(learning.evidenceRevision).toBe(0);
        expect(
          accessBootstrapCache.invalidateForOrganization,
        ).not.toHaveBeenCalled();
      },
    );
    it('preserves explicit null organization on an ordinary same-scope patch', async () => {
      const row = credential('unbound', null);
      storedRows([row]);
      await service.patch('unbound', {
        organizationId: null,
        description: 'legacy',
      } as never);
      expect(row.organizationId).toBeNull();
      expect(prisma.credential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unbound', organizationId: null, isDeleted: false },
        }),
      );
      expect(prisma.contentLearningDependency.findMany).not.toHaveBeenCalled();
      expect(prisma.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    });
    it('OAuth revival and connected-source retirement invalidate both original sources with one revision per existing account', async () => {
      const source = credential('source'),
        incumbent = credential('incumbent'),
        sourceAccount = account('source'),
        incumbentAccount = account('incumbent');
      source.externalId = 'account';
      incumbent.isConnected = false;
      source.userId = 'user';
      incumbent.userId = 'user';
      storedRows([source, incumbent], [incumbentAccount, sourceAccount]);
      const survivor = await service.updateExternalProfile('source', orgId, {
        id: 'account',
        bannerUrl: 'https://platform.example/banner.jpg',
      });
      expect(survivor.id).toBe('incumbent');
      expect(source.isDeleted).toBe(true);
      expect(source.isConnected).toBe(false);
      expect(incumbent.isConnected).toBe(true);
      expect(sourceAccount.evidenceRevision).toBe(1);
      expect(incumbentAccount.evidenceRevision).toBe(1);
      const refs = prisma.contentLearningDependency.findMany.mock.calls.map(
        (call) => call[0].where.sourceId,
      );
      expect(refs).toEqual(['incumbent', 'source']);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
    it('OAuth token refresh of an already connected identity is a source no-op', async () => {
      const source = credential('source'),
        learning = account('source');
      storedRows([source], [learning]);
      await service.connectAccount(
        'source',
        orgId,
        { id: 'account' },
        { accessToken: 'replacement-token' },
      );
      expect(crypto.decrypt(source.accessToken as string)).toBe(
        'replacement-token',
      );
      expect(learning.evidenceRevision).toBe(0);
      expect(prisma.contentLearningDependency.findMany).not.toHaveBeenCalled();
    });
  });
});
