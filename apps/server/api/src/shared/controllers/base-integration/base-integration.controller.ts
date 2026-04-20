import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus } from '@nestjs/common';

type IntegrationBrand = {
  _id: string;
  organization: string;
};

/**
 * OAuth URL generation result
 */
export interface OAuthUrlResult {
  url: string;
  state?: string;
  oauthToken?: string;
  oauthTokenSecret?: string;
}

/**
 * OAuth verification result
 */
export interface OAuthVerifyResult {
  accessToken: string;
  accessSecret?: string;
  refreshToken?: string;
  expiryDate?: number;
  externalId?: string;
  externalHandle?: string;
}

/**
 * BaseIntegrationController - Abstract base class for platform integration controllers
 *
 * Provides common integration patterns:
 * - connect() method with brand validation
 * - Authorization checks
 * - Metadata enrichment
 * - Error handling
 *
 * @example
 * @Controller('services/youtube')
 * export class YoutubeController extends BaseIntegrationController {
 *   protected readonly platform = CredentialPlatform.YOUTUBE;
 *
 *   constructor(
 *     protected readonly brandsService: BrandsService,
 *     protected readonly credentialsService: CredentialsService,
 *     protected readonly loggerService: LoggerService,
 *     private readonly youtubeService: YoutubeService,
 *   ) {
 *     super(brandsService, credentialsService, loggerService, YoutubeController.name);
 *   }
 *
 *   protected async generateOAuthUrl(brandId: string, publicMetadata: IClerkPublicMetadata): Promise<OAuthUrlResult> {
 *     const authUrl = this.youtubeService.generateAuthUrl({ ... });
 *     return { url: authUrl };
 *   }
 *
 *   @Post('connect')
 *   async connect(@CurrentUser() user: User, @Body() dto: CreateCredentialDto) {
 *     return this.handleConnect(user, dto, request);
 *   }
 * }
 */
export abstract class BaseIntegrationController {
  protected readonly constructorName: string;

  /**
   * The platform this controller handles
   */
  protected abstract readonly platform: CredentialPlatform;

  constructor(
    protected readonly brandsService: BrandsService,
    protected readonly credentialsService: CredentialsService,
    protected readonly loggerService: LoggerService,
    constructorName: string,
  ) {
    this.constructorName = constructorName;
  }

  /**
   * Get the URL identifier for logging
   */
  protected getLogUrl(methodName?: string): string {
    const callerName = methodName || CallerUtil.getCallerName();
    return `${this.constructorName} ${callerName}`;
  }

  /**
   * Generate OAuth URL for the platform
   * Must be implemented by subclasses
   *
   * @param brandId - The brand ID to connect
   * @param publicMetadata - User's public metadata
   * @returns OAuth URL and optional tokens
   */
  protected abstract generateOAuthUrl(
    brandId: string,
    publicMetadata: IClerkPublicMetadata,
  ): Promise<OAuthUrlResult>;

  /**
   * Validate and get brand with organization check
   *
   * @param brandId - Brand ID from request
   * @param organizationId - Organization ID from user metadata
   * @returns The validated brand
   * @throws HttpException if brand not found or access denied
   */
  protected async validateBrand(
    brandId: string,
    organizationId: string,
  ): Promise<IntegrationBrand> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return brand as unknown as IntegrationBrand;
  }

  /**
   * Get or create a pending credential for the brand
   *
   * @param brand - The brand document
   * @param initialData - Initial credential data
   * @returns The credential (existing or newly created)
   */
  protected async getOrCreateCredential(
    brand: { _id: string; organization: string },
    initialData: Record<string, unknown> = {},
  ) {
    const existingCredential = await this.credentialsService.findOne({
      brand: brand._id,
      organization: brand.organization,
      platform: this.platform,
    });

    if (existingCredential) {
      return existingCredential;
    }

    await this.credentialsService.saveCredentials(brand, this.platform, {
      isConnected: false,
      ...initialData,
    });

    return this.credentialsService.findOne({
      brand: brand._id,
      organization: brand.organization,
      platform: this.platform,
    });
  }

  /**
   * Handle the connect flow with standard validation and error handling
   *
   * @param user - Clerk user object
   * @param createCredentialDto - DTO with brand ID
   * @returns OAuth URL result
   */
  protected async handleConnect(
    user: User,
    createCredentialDto: Partial<CreateCredentialDto>,
  ): Promise<OAuthUrlResult> {
    const url = this.getLogUrl('connect');
    this.loggerService.log(url, createCredentialDto);

    const publicMetadata = getPublicMetadata(user);

    if (!createCredentialDto.brand) {
      throw new HttpException(
        {
          detail: 'Brand ID is required',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const brand = await this.validateBrand(
        // @ts-expect-error TS2345
        createCredentialDto.brand,
        publicMetadata.organization,
      );

      // Generate OAuth URL
      const oauthResult = await this.generateOAuthUrl(
        brand._id.toString(),
        publicMetadata,
      );

      // Save credential with OAuth tokens if provided
      if (oauthResult.oauthToken || oauthResult.oauthTokenSecret) {
        await this.credentialsService.saveCredentials(brand, this.platform, {
          isConnected: false,
          oauthToken: oauthResult.oauthToken,
          oauthTokenSecret: oauthResult.oauthTokenSecret,
        });
      } else {
        await this.getOrCreateCredential(brand);
      }

      return oauthResult;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Update credential with verified OAuth tokens
   *
   * @param credentialId - The credential string ID
   * @param verifyResult - OAuth verification result
   * @returns Updated credential
   */
  protected updateCredentialWithTokens(
    credentialId: string,
    verifyResult: OAuthVerifyResult,
  ) {
    return this.credentialsService.patch(credentialId, {
      accessToken: verifyResult.accessToken,
      accessTokenSecret: verifyResult.accessSecret,
      externalHandle: verifyResult.externalHandle,
      externalId: verifyResult.externalId,
      isConnected: true,
      isDeleted: false, // Reactivate if previously disconnected
      oauthToken: undefined, // Clear temporary tokens
      oauthTokenSecret: undefined,
      refreshToken: verifyResult.refreshToken,
      refreshTokenExpiry: verifyResult.expiryDate
        ? new Date(verifyResult.expiryDate)
        : undefined,
    });
  }
}
