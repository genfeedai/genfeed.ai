// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Credential via the
// light @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime
// import required for BaseService's getModelMeta('credential') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@server/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import process from 'node:process';
import { CredentialPlatform, SubscriptionTier } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import { CredentialCryptoService } from '@server/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';

const KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? 'test-encryption-key-for-testing-only';
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

describe('CredentialsService', () => {
  let service: CredentialsService;
  let crypto: CredentialCryptoService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    credential: Record<string, ReturnType<typeof vi.fn>>;
    organizationSetting: Record<string, ReturnType<typeof vi.fn>>;
    post: Record<string, ReturnType<typeof vi.fn>>;
    postAnalytics: Record<string, ReturnType<typeof vi.fn>>;
    tag: Record<string, ReturnType<typeof vi.fn>>;
  };
  let logger: Record<string, ReturnType<typeof vi.fn>>;
  let filesClient: { uploadToS3: ReturnType<typeof vi.fn> };

  const orgId = 'test-org-id';
  const brandId = 'test-brand-id';

  beforeEach(() => {
    prisma = {
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

    service = new CredentialsService(
      prisma as never,
      logger as never,
      crypto,
      filesClient as never,
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
        { id: 'credential-1' },
        { id: 'credential-2' },
      ]);
      prisma.credential.updateMany.mockResolvedValue({ count: 2 });

      const count = await service.purgeProviderAccount(
        CredentialPlatform.THREADS,
        '  provider-user-1  ',
      );

      expect(count).toBe(2);
      expect(prisma.postAnalytics.deleteMany).toHaveBeenCalledWith({
        where: {
          platform: 'THREADS',
          post: {
            credentialId: { in: ['credential-1', 'credential-2'] },
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
          credentialId: { in: ['credential-1', 'credential-2'] },
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
          id: { in: ['credential-1', 'credential-2'] },
          platform: 'THREADS',
        },
      });
    });

    it('rejects an empty provider id without touching credentials', async () => {
      await expect(
        service.purgeProviderAccount(CredentialPlatform.THREADS, '   '),
      ).rejects.toThrow('external id');

      expect(prisma.credential.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('encrypt-on-write boundary', () => {
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
          id: 'cred-b',
          platform: 'TWITTER',
        },
        {
          createdAt: '2026-01-01T00:00:00.000Z',
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
      prisma.credential.findFirst.mockResolvedValueOnce(pendingCredential);
    }

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
      prisma.credential.findFirst.mockResolvedValueOnce(null); // no incumbent

      await service.updateExternalProfile('pending-1', orgId, {
        handle: 'second_account',
        id: 'account-2',
      });

      const patched = prisma.credential.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      };

      expect(patched.where).toEqual({ id: 'pending-1' });
      expect(patched.data).toEqual(
        expect.objectContaining({
          externalId: 'account-2',
          isConnected: true,
          isDeleted: false,
          oauthState: null,
        }),
      );
    });

    it('merges into the incumbent and retires the pending row on reconnect', async () => {
      loadPendingCredential();
      prisma.credential.findFirst.mockResolvedValueOnce({ id: 'incumbent-1' });

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
          isDeleted: false,
        }),
      );

      expect(retirementUpdate.where).toEqual({
        id: 'pending-1',
        isDeleted: false,
        organizationId: orgId,
      });
      expect(retirementUpdate.data).toEqual({
        isConnected: false,
        isDeleted: true,
        oauthState: null,
      });
    });

    it('folds into the winner when a concurrent verify claimed the identity first', async () => {
      loadPendingCredential();
      prisma.credential.findFirst.mockResolvedValueOnce(null); // no incumbent yet
      prisma.credential.update.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      prisma.credential.findFirst.mockResolvedValueOnce({ id: 'winner-1' }); // retry finds it

      const survivor = await service.updateExternalProfile('pending-1', orgId, {
        id: 'account-1',
      });

      expect(survivor.id).toBe('winner-1');
      expect(prisma.credential.update.mock.calls.at(-1)?.[0]).toEqual({
        data: { isConnected: false, isDeleted: true, oauthState: null },
        where: {
          id: 'pending-1',
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('rethrows a unique violation when no winner can be found', async () => {
      loadPendingCredential();
      prisma.credential.findFirst.mockResolvedValueOnce(null);
      prisma.credential.update.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      prisma.credential.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateExternalProfile('pending-1', orgId, { id: 'account-1' }),
      ).rejects.toThrow(/Unique constraint failed/);
    });

    it('reconnects a soft-deleted account without treating it as an incumbent', async () => {
      loadPendingCredential();
      prisma.credential.findFirst.mockResolvedValueOnce(null); // soft-deleted row excluded

      await service.updateExternalProfile('pending-1', orgId, {
        id: 'account-1',
      });

      const incumbentLookup = prisma.credential.findFirst.mock.calls.find(
        (call) =>
          (call[0] as { where?: Record<string, unknown> })?.where
            ?.externalId === 'account-1',
      )?.[0] as { where: Record<string, unknown> };

      expect(incumbentLookup.where.isDeleted).toBe(false);
      expect(incumbentLookup.where.organizationId).toBe(orgId);
    });

    it('applies the connection payload before identity is settled', async () => {
      loadPendingCredential(); // updateExternalProfile reads the pending row
      prisma.credential.findFirst.mockResolvedValueOnce(null); // no incumbent

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
        id: 'credential-1',
        isConnected: false,
        isDeleted: false,
        organizationId: orgId,
        platform: 'X_ADS',
        userId: 'u1',
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
      prisma.credential.findFirst.mockResolvedValue({
        brandId,
        externalId: 'provider-1',
        id: 'existing-id',
        organizationId: orgId,
        platform: 'TWITTER',
      });
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

      await expect(
        service.patch('existing-id', { isConnected: true }),
      ).resolves.toMatchObject({ id: 'existing-id' });
      expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
      expect(prisma.credential.count).not.toHaveBeenCalled();
    });
  });
});
