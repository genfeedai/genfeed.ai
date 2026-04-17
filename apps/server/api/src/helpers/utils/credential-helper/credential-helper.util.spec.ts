import { CredentialPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => `decrypted:${val}`),
  },
}));

import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';

import { CredentialHelper } from './credential-helper.util';

const orgId = '507f191e810c19729de860ee'.toHexString();
const brandId = '507f191e810c19729de860ee'.toHexString();
const platform = CredentialPlatform.INSTAGRAM;

const baseOptions = { brandId, organizationId: orgId, platform };

const mockCredential = {
  _id: '507f191e810c19729de860ee',
  accessToken: 'encrypted-token',
  platform,
};

function makeCredentialsService(credential: typeof mockCredential | null) {
  return {
    findOne: vi.fn().mockResolvedValue(credential),
  };
}

describe('CredentialHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDecryptedCredential', () => {
    it('returns credential and decrypted token', async () => {
      const service = makeCredentialsService(mockCredential);
      const result = await CredentialHelper.getDecryptedCredential(
        service as never,
        baseOptions,
      );

      expect(result.credential).toBe(mockCredential);
      expect(result.decryptedToken).toBe('decrypted:encrypted-token');
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
    });

    it('passes correct query to findOne', async () => {
      const service = makeCredentialsService(mockCredential);
      await CredentialHelper.getDecryptedCredential(
        service as never,
        baseOptions,
      );

      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
          platform,
        }),
      );
    });

    it('throws when credential is not found', async () => {
      const service = makeCredentialsService(null);
      await expect(
        CredentialHelper.getDecryptedCredential(service as never, baseOptions),
      ).rejects.toThrow(`${platform} credential not found`);
    });

    it('throws when credential has no access token', async () => {
      const noTokenCred = { ...mockCredential, accessToken: null };
      const service = makeCredentialsService(noTokenCred as never);
      await expect(
        CredentialHelper.getDecryptedCredential(service as never, baseOptions),
      ).rejects.toThrow(`${platform} access token not found`);
    });
  });

  describe('getCredential', () => {
    it('returns credential without decrypting', async () => {
      const service = makeCredentialsService(mockCredential);
      const result = await CredentialHelper.getCredential(
        service as never,
        baseOptions,
      );

      expect(result).toBe(mockCredential);
      expect(EncryptionUtil.decrypt).not.toHaveBeenCalled();
    });

    it('throws when credential is not found', async () => {
      const service = makeCredentialsService(null);
      await expect(
        CredentialHelper.getCredential(service as never, baseOptions),
      ).rejects.toThrow(`${platform} credential not found`);
    });
  });

  describe('buildQuery', () => {
    it('builds a query with ObjectId fields', () => {
      const query = CredentialHelper.buildQuery(baseOptions);

      expect(query.brand).toBeInstanceOf(Types.ObjectId);
      expect(query.organization).toBeInstanceOf(Types.ObjectId);
      expect(String(query.brand)).toBe(brandId);
      expect(String(query.organization)).toBe(orgId);
      expect(query.platform).toBe(platform);
      expect(query.isDeleted).toBe(false);
    });
  });
});
