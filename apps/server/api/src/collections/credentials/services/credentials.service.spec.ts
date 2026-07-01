// `@genfeedai/prisma` re-exports the generated PrismaClient, unavailable/heavy
// in unit tests (see font-families.service.spec.ts for full rationale). Stub
// `PrismaClient` and inline the real `Credential` entry from
// packages/prisma/src/enum-field-map.ts (PRISMA_MODEL_METADATA.Credential) so
// BaseService's `getModelMeta('credential')` call sees genuine field metadata.
vi.mock('@genfeedai/prisma', () => ({
  getModelMeta: (modelName: string) => {
    const pascal = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    const metadata: Record<
      string,
      {
        allFields: readonly string[];
        enumFields: Readonly<
          Record<string, { enumType: string; isRequired: boolean }>
        >;
      }
    > = {
      Credential: {
        allFields: [
          'accessToken',
          'accessTokenExpiry',
          'accessTokenSecret',
          'brand',
          'brandId',
          'createdAt',
          'description',
          'externalAvatar',
          'externalHandle',
          'externalId',
          'externalName',
          'id',
          'isConnected',
          'isDeleted',
          'label',
          'mongoId',
          'oauthState',
          'oauthToken',
          'oauthTokenHash',
          'oauthTokenSecret',
          'organization',
          'organizationId',
          'platform',
          'refreshToken',
          'refreshTokenExpiry',
          'updatedAt',
          'user',
          'userId',
          'username',
        ],
        enumFields: {
          platform: { enumType: 'CredentialPlatform', isRequired: true },
        },
      },
    };
    return metadata[pascal];
  },
  PrismaClient: class {},
}));

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
      expect(data.platform).toBe('twitter');
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
