import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { toPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  AdsAdapterContext,
  AdsPlatform,
} from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

const VALID_PLATFORMS: AdsPlatform[] = ['meta', 'google', 'tiktok', 'x'];

export interface AdsGatewayAdapterContextInput {
  adAccountId: string;
  credentialId: string;
  loginCustomerId?: string;
}

interface AdsCredentialAuth {
  accessToken: string;
  accessTokenSecret?: string;
}

@Injectable()
export class AdsGatewayRequestContextService {
  constructor(private readonly credentialsService: CredentialsService) {}

  validatePlatform(platform: string): AdsPlatform {
    if (!VALID_PLATFORMS.includes(platform as AdsPlatform)) {
      throw new BadRequestException(
        `Invalid platform: ${platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
      );
    }

    return platform as AdsPlatform;
  }

  async createAdapterContext(
    user: User,
    platform: AdsPlatform,
    input: AdsGatewayAdapterContextInput,
  ): Promise<AdsAdapterContext> {
    const { organizationId } = extractRequestContext(user);
    const credentialAuth = await this.resolveCredentialAuth(
      input.credentialId,
      organizationId,
      platform,
    );

    return {
      ...credentialAuth,
      adAccountId: input.adAccountId,
      brandId: undefined,
      credentialId: input.credentialId,
      loginCustomerId: input.loginCustomerId,
      organizationId,
    };
  }

  private async resolveCredentialAuth(
    credentialId: string,
    organizationId: string,
    platform: AdsPlatform,
  ): Promise<AdsCredentialAuth> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: toPrismaCredentialPlatform(mapAdsCredentialPlatform(platform)),
    });

    if (!credential?.accessToken) {
      throw new UnauthorizedException(
        `Credential ${credentialId} not found or missing access token`,
      );
    }

    if (platform === 'x' && !credential.accessTokenSecret) {
      throw new UnauthorizedException(
        `Credential ${credentialId} not found or missing access token secret`,
      );
    }

    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      accessTokenSecret: credential.accessTokenSecret
        ? EncryptionUtil.decrypt(credential.accessTokenSecret)
        : undefined,
    };
  }
}
