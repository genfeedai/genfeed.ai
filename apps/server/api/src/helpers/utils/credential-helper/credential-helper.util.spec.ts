import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => `decrypted:${val}`),
  },
}));

import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

import { CredentialHelper } from './credential-helper.util';

const orgId = testId('org');
const brandId = testId('brand');
const platform = CredentialPlatform.INSTAGRAM;

const baseOptions = { brandId, organizationId: orgId, platform };

const mockCredential = {
  id: testId('credential'),
  accessToken: 'encrypted-token',
  platform,
};

function makeCredentialsService(credential: typeof mockCredential | null) {
  return {
    findOne: vi.fn().mockResolvedValue(credential),
    // The helper resolves the brand account through the multi-account
    // resolver; the double answers with the one credential each case
    // describes.
    resolveBrandAccount: vi.fn().mockResolvedValue(credential),
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

    it('resolves the brand account rather than querying directly', async () => {
      const service = makeCredentialsService(mockCredential);
      await CredentialHelper.getDecryptedCredential(
        service as never,
        baseOptions,
      );

      expect(service.resolveBrandAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: expect.any(String),
          organizationId: expect.any(String),
          platform,
        }),
      );
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('asks for the named account when a credential id is given', async () => {
      // A brand holding several accounts on one platform acts as the account
      // the caller named, never as whichever row the brand lists first.
      const service = makeCredentialsService(mockCredential);
      const credentialId = testId('credential');

      await CredentialHelper.getDecryptedCredential(service as never, {
        ...baseOptions,
        credentialId,
      });

      expect(service.resolveBrandAccount).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId }),
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
    it('pins the query to one account when a credential id is given', () => {
      const credentialId = testId('credential');
      const query = CredentialHelper.buildQuery({
        ...baseOptions,
        credentialId,
      });

      expect(query.id).toBe(credentialId);
    });

    it('builds a query with canonical relation IDs', () => {
      const query = CredentialHelper.buildQuery(baseOptions);

      expect(query.brandId).toEqual(expect.any(String));
      expect(query.organizationId).toEqual(expect.any(String));
      expect(String(query.brandId)).toBe(brandId);
      expect(String(query.organizationId)).toBe(orgId);
      expect(query.platform).toBe(platform);
      expect(query.isDeleted).toBe(false);
    });
  });
});
