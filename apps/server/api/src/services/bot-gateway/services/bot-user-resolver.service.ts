import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type { IBotResolvedUser } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

function readId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Injectable()
export class BotUserResolverService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Resolve a Genfeed user from their platform user ID
   * Returns null if user hasn't connected their account
   */
  async resolveUser(
    platform: CredentialPlatform,
    platformUserId: string,
  ): Promise<IBotResolvedUser | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Find credential by platform user ID (externalId)
      const credential = await this.credentialsService.findOne({
        externalId: platformUserId,
        isConnected: true,
        isDeleted: false,
        platform,
      });

      if (!credential) {
        this.loggerService.log(`${url} no credential found`, {
          platform,
          platformUserId,
        });
        return null;
      }

      const brandId = readId(credential.brand);
      const credentialId = readId(credential._id);
      const organizationId = readId(credential.organization);
      const userId = readId(credential.user);

      if (!brandId || !credentialId || !organizationId || !userId) {
        this.loggerService.warn(`${url} credential missing ownership ids`, {
          brandId,
          credentialId,
          organizationId,
          platform,
          platformUserId,
          userId,
        });
        return null;
      }

      this.loggerService.log(`${url} resolved user`, {
        brandId,
        credentialId,
        organizationId,
      });

      return {
        brandId,
        credentialId,
        organizationId,
        userId,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return null;
    }
  }

  /**
   * Resolve user and optionally switch to a different brand by name
   */
  async resolveUserWithBrand(
    platform: CredentialPlatform,
    platformUserId: string,
    brandName?: string,
  ): Promise<IBotResolvedUser | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const resolvedUser = await this.resolveUser(platform, platformUserId);
    if (!resolvedUser) {
      return null;
    }

    // If no brand name specified, use the credential's brand
    if (!brandName) {
      return resolvedUser;
    }

    try {
      // Find brand by name within the user's organization
      const brand = await this.brandsService.findOne({
        isDeleted: false,
        label: { contains: new RegExp(`^${brandName}$`, 'i') },
        organization: resolvedUser.organizationId,
      });

      if (!brand) {
        this.loggerService.warn(`${url} brand not found`, {
          brandName,
          organizationId: resolvedUser.organizationId,
        });
        // Return original resolved user if brand not found
        return resolvedUser;
      }

      this.loggerService.log(`${url} switched to brand`, {
        brandId: brand._id.toString(),
        brandName: brand.label ?? brand._id.toString(),
      });

      return {
        ...resolvedUser,
        brandId: brand._id.toString(),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} brand lookup failed`, error);
      return resolvedUser;
    }
  }

  /**
   * Get list of brands for a user (for status command)
   */
  async getUserBrands(
    organizationId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const brands = await this.brandsService.find({
        isDeleted: false,
        organization: organizationId,
      });

      return brands.map((brand) => ({
        id: brand._id.toString(),
        name: brand.label ?? brand._id.toString(),
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to get brands`, error);
      return [];
    }
  }
}
