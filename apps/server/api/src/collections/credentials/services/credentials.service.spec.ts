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
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SubscriptionTier } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';

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
        update: vi.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'existing-id', ...args.data }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      organizationSetting: {
        findUnique: vi.fn().mockResolvedValue({
          subscriptionTier: SubscriptionTier.FREE,
        }),
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

  describe('upsertForBrand', () => {
    it('encrypts secrets when creating a new credential', async () => {
      await service.upsertForBrand(
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
      await service.upsertForBrand(
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
      await service.upsertForBrand(
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
        service.upsertForBrand(
          { id: brandId } as never,
          'u1',
          'twitter' as never,
          { accessToken: 'save-raw' },
        ),
      ).rejects.toThrow(/organization/);

      expect(prisma.credential.create).not.toHaveBeenCalled();
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
      prisma.credential.findFirst.mockResolvedValue({ id: 'existing-id' });
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
