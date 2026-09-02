import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

export interface CredentialWithToken {
  credential: CredentialDocument;
  decryptedToken: string;
}

export interface GetCredentialOptions {
  organizationId: string;
  brandId: string;
  platform: CredentialPlatform;
  /**
   * Which of the brand's accounts on this platform to act as. Omitted resolves
   * the brand's default account and logs the ones passed over.
   */
  credentialId?: string;
}

/**
 * Helper utility for credential operations across integration services.
 * Encapsulates the common pattern of finding and decrypting credentials.
 */
export class CredentialHelper {
  /**
   * Find and decrypt a credential for the given organization, brand, and platform.
   *
   * @throws Error if credential not found or has no access token
   */
  static async getDecryptedCredential(
    credentialsService: CredentialsService,
    options: GetCredentialOptions,
  ): Promise<CredentialWithToken> {
    const { organizationId, brandId, credentialId, platform } = options;

    const credential = await credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId,
      platform,
    });

    if (!credential) {
      throw new Error(`${platform} credential not found`);
    }

    if (!credential.accessToken) {
      throw new Error(
        `${platform} access token not found. Please reconnect your account.`,
      );
    }

    const decryptedToken = EncryptionUtil.decrypt(credential.accessToken);

    return { credential, decryptedToken };
  }

  /**
   * Find credential without decryption (for cases where token isn't needed).
   *
   * @throws Error if credential not found
   */
  static async getCredential(
    credentialsService: CredentialsService,
    options: GetCredentialOptions,
  ): Promise<CredentialDocument> {
    const { organizationId, brandId, credentialId, platform } = options;

    const credential = await credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId,
      platform,
    });

    if (!credential) {
      throw new Error(`${platform} credential not found`);
    }

    return credential;
  }

  /**
   * Build standard credential query with organization, brand, and platform.
   */
  static buildQuery(options: GetCredentialOptions): Record<string, unknown> {
    const { organizationId, brandId, credentialId, platform } = options;

    return {
      brandId,
      isDeleted: false,
      organizationId,
      platform,
      ...(credentialId ? { id: credentialId } : {}),
    };
  }
}
