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
import type { ConfigService } from '@api/config/config.service';

const KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? 'test-encryption-key-for-testing-only';
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

describe('CredentialsService', () => {
  let service: CredentialsService;
  let crypto: CredentialCryptoService;
  let prisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let logger: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = 'test-org-id';
  const brandId = 'test-brand-id';

  beforeEach(() => {
    prisma = {
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
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    crypto = new CredentialCryptoService({
      tokenEncryptionKey: KEY,
    } as unknown as ConfigService);

    service = new CredentialsService(prisma as never, logger as never, crypto);
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

  describe('saveCredentials', () => {
    it('encrypts secrets when creating a new credential', async () => {
      await service.saveCredentials(
        { id: brandId, organizationId: orgId, userId: 'u1' },
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
  });
});
