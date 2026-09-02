import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ConnectCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus } from '@nestjs/common';

type IntegrationBrand = {
  id: string;
  organizationId: string;
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
 *   protected async generateOAuthUrl(brandId: string, user: AuthenticatedUser): Promise<OAuthUrlResult> {
 *     const authUrl = this.youtubeService.generateAuthUrl({ ... });
 *     return { url: authUrl };
 *   }
 *
 *   @Post('connect')
 *   async connect(@CurrentUser() user: User, @Body() dto: ConnectCredentialDto) {
 *     return this.handleConnect(user, dto, request);
 *   }
 * }
 */
export abstract class BaseIntegrationController {
  /**
   * Query params through which our integrations pass the server's provider-app
   * identity: `client_id` (most), `client_key` (TikTok), `app_id` (Meta) and the
   * OAuth 1.0a consumer keys.
   */
  private static readonly PROVIDER_IDENTITY_PARAMS = [
    'app_id',
    'client_id',
    'client_key',
    'consumer_key',
    'oauth_consumer_key',
  ];

  /** What an unset ConfigService value looks like once it reaches a query string. */
  private static readonly UNSET_CONFIG_VALUES = new Set([
    '',
    'null',
    'undefined',
  ]);

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
   * @param user - Authenticated user
   * @returns OAuth URL and optional tokens
   */
  protected abstract generateOAuthUrl(
    brandId: string,
    user: AuthenticatedUser,
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
      id: brandId,
      organizationId: organizationId,
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
   * Provision a pending credential for an in-flight connection.
   *
   * Always a new row. A brand may already hold accounts on this platform, and
   * which one the operator is about to authorize is not known until the
   * provider callback returns — so reusing a live row here would overwrite a
   * working account's tokens on the strength of a guess. Identity is settled
   * afterwards by `CredentialsService.updateExternalProfile`.
   */
  protected createPendingCredential(
    brand: IntegrationBrand,
    userId: string,
    initialData: Record<string, unknown> = {},
  ) {
    return this.credentialsService.createPendingForBrand(
      brand,
      userId,
      this.platform,
      initialData,
    );
  }

  /**
   * Handle the connect flow with standard validation and error handling
   *
   * @param user - authenticated user
   * @param createCredentialDto - DTO with brand ID
   * @returns OAuth URL result
   */
  protected async handleConnect(
    user: User,
    createCredentialDto: ConnectCredentialDto,
  ): Promise<OAuthUrlResult> {
    const url = this.getLogUrl('connect');
    this.loggerService.log(url, createCredentialDto);

    try {
      if (!createCredentialDto.brandId) {
        throw new HttpException(
          {
            detail: 'Brand ID is required',
            title: 'Invalid payload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const brand = await this.validateBrand(
        createCredentialDto.brandId,
        user.organizationId,
      );

      // Generate OAuth URL
      const oauthResult = await this.generateOAuthUrl(brand.id, user);

      // Before anything is persisted: a platform whose provider-app config is
      // missing builds an authorize URL carrying `undefined` credentials. Left
      // unchecked the request succeeds, a permanently unconnectable credential
      // row is written, and the account reads "Not connected" forever with no
      // trace of the real cause.
      this.assertOAuthUrlIsConfigured(oauthResult.url);

      // Save credential with OAuth tokens if provided
      await this.createPendingCredential(
        brand,
        user.userId ?? user.id,
        oauthResult.oauthToken || oauthResult.oauthTokenSecret
          ? {
              oauthToken: oauthResult.oauthToken,
              oauthTokenSecret: oauthResult.oauthTokenSecret,
            }
          : {},
      );

      return oauthResult;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Reject an authorize URL built from absent provider-app configuration.
   *
   * Every integration reads its client id/secret straight off ConfigService and
   * casts the result to `string`, so an unset key reaches the OAuth client as
   * `undefined` and is serialized into the query string verbatim. The provider
   * then rejects the round-trip and the verify callback never runs.
   *
   * Only params that are actually present are checked: OAuth 1.0a flows (X)
   * carry a request token instead of a client id, and their absence here is
   * correct rather than a misconfiguration.
   */
  protected assertOAuthUrlIsConfigured(url: string): void {
    const notConfigured = (detail: string): HttpException => {
      this.loggerService.error(
        `${this.getLogUrl('connect')} blocked: ${this.platform} is not configured`,
        detail,
      );

      return new HttpException(
        { detail, title: 'Integration not configured' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    };

    let searchParams: URLSearchParams;

    try {
      searchParams = new URL(url).searchParams;
    } catch {
      throw notConfigured(
        `The ${this.platform} integration produced an invalid authorization URL. Check its provider credentials on this server.`,
      );
    }

    for (const param of BaseIntegrationController.PROVIDER_IDENTITY_PARAMS) {
      const value = searchParams.get(param);

      if (value === null) {
        continue;
      }

      if (BaseIntegrationController.UNSET_CONFIG_VALUES.has(value.trim())) {
        throw notConfigured(
          `The ${this.platform} integration is missing its provider credentials on this server (${param} is not set).`,
        );
      }
    }
  }

  /**
   * Settle a pending credential with verified OAuth tokens.
   *
   * Routes through `connectAccount` so the provider's account id decides whether
   * this refreshes the brand's existing account on this platform or becomes an
   * additional one. Never patch `externalId` onto a credential directly.
   *
   * @param credentialId - The pending credential string ID
   * @param organizationId - Tenant that owns the credential
   * @param verifyResult - OAuth verification result
   * @returns The surviving credential for this account identity
   */
  protected updateCredentialWithTokens(
    credentialId: string,
    organizationId: string,
    verifyResult: OAuthVerifyResult,
  ) {
    return this.credentialsService.connectAccount(
      credentialId,
      organizationId,
      {
        handle: verifyResult.externalHandle,
        id: verifyResult.externalId,
      },
      {
        accessToken: verifyResult.accessToken,
        accessTokenSecret: verifyResult.accessSecret,
        oauthToken: null, // Clear temporary tokens
        oauthTokenSecret: null,
        refreshToken: verifyResult.refreshToken,
        refreshTokenExpiry: verifyResult.expiryDate
          ? new Date(verifyResult.expiryDate)
          : undefined,
      },
    );
  }
}
