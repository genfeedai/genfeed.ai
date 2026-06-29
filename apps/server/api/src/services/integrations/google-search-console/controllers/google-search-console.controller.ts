import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import type { GoogleSearchConsoleDimension } from '@genfeedai/interfaces';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
  GoogleSearchConsoleSearchAnalyticsSerializer,
  GoogleSearchConsoleSiteSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

const DEFAULT_GSC_DIMENSIONS: GoogleSearchConsoleDimension[] = [
  'query',
  'page',
  'country',
  'device',
];

@AutoSwagger()
@Controller('services/google-search-console')
export class GoogleSearchConsoleController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly googleSearchConsoleOAuthService: GoogleSearchConsoleOAuthService,
    private readonly googleSearchConsoleService: GoogleSearchConsoleService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const publicMetadata = getPublicMetadata(user);
    const brand = await this.brandsService.findOne({
      _id: createCredentialDto.brand,
      isDeleted: false,
      organization: publicMetadata.organization,
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

    const state = JSON.stringify({
      brandId: brand._id,
      organizationId: brand.organization,
      userId: publicMetadata.user,
    });

    await this.credentialsService.saveCredentials(
      brand,
      CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
      {
        isConnected: false,
      },
    );

    const url = this.googleSearchConsoleOAuthService.generateAuthUrl(state);
    return serializeSingle(request, CredentialOAuthSerializer, { url });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    if (!body.code || !body.state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { brandId, organizationId, userId } = this.parseState(body.state);
    const publicMetadata = getPublicMetadata(user);

    if (userId !== publicMetadata.user) {
      throw new HttpException(
        {
          detail: 'OAuth state does not match the authenticated user',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
      user: publicMetadata.user,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'Google Search Console credential not found',
          title: 'OAuth Error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokens =
      await this.googleSearchConsoleOAuthService.exchangeAuthCodeForAccessToken(
        body.code,
      );
    const sites = await this.googleSearchConsoleService.listSites(
      tokens.accessToken,
    );
    const primarySite = sites[0];

    if (!primarySite) {
      throw new BadRequestException(
        'No verified Google Search Console properties found for this account. Verify a property in Google Search Console, then reconnect.',
      );
    }

    const updatedCredential = await this.credentialsService.patch(
      credential._id,
      {
        accessToken: tokens.accessToken,
        accessTokenExpiry: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        externalHandle: primarySite?.siteUrl || 'Google Search Console',
        externalId: primarySite?.siteUrl,
        externalName:
          primarySite?.permissionLevel || 'Google Search Console property',
        isConnected: true,
        isDeleted: false,
        refreshToken: tokens.refreshToken,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Get('sites')
  async listSites(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId?: string,
  ) {
    const accessToken = await this.getAccessTokenFromCredential(user, brandId);
    const sites = await this.googleSearchConsoleService.listSites(accessToken);

    return serializeCollection(request, GoogleSearchConsoleSiteSerializer, {
      docs: sites,
    });
  }

  @Get('search-analytics')
  async getSearchAnalytics(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('siteUrl') siteUrl: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('dimensions') dimensions?: string | string[],
    @Query('rowLimit') rowLimit?: string,
    @Query('startRow') startRow?: string,
    @Query('brandId') brandId?: string,
  ) {
    if (!siteUrl || !startDate || !endDate) {
      throw new HttpException(
        {
          detail: 'siteUrl, startDate, and endDate are required',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const accessToken = await this.getAccessTokenFromCredential(user, brandId);
    const result = await this.googleSearchConsoleService.getSearchAnalytics(
      accessToken,
      {
        dimensions: this.parseDimensions(dimensions),
        endDate,
        rowLimit: rowLimit ? Number(rowLimit) : undefined,
        siteUrl,
        startDate,
        startRow: startRow ? Number(startRow) : undefined,
      },
    );

    return serializeSingle(
      request,
      GoogleSearchConsoleSearchAnalyticsSerializer,
      result,
    );
  }

  private parseState(state: string): {
    brandId: string;
    organizationId: string;
    userId: string;
  } {
    try {
      const parsed = JSON.parse(state) as {
        brandId?: unknown;
        organizationId?: unknown;
        userId?: unknown;
      };

      if (
        typeof parsed.brandId !== 'string' ||
        typeof parsed.organizationId !== 'string' ||
        typeof parsed.userId !== 'string'
      ) {
        throw new Error('Missing identifiers');
      }

      return {
        brandId: parsed.brandId,
        organizationId: parsed.organizationId,
        userId: parsed.userId,
      };
    } catch {
      throw new HttpException(
        {
          detail: 'Invalid OAuth state',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private parseDimensions(
    value?: string | string[],
  ): GoogleSearchConsoleDimension[] {
    const raw = Array.isArray(value)
      ? value.flatMap((item) => item.split(','))
      : (value?.split(',') ?? []);
    const dimensions = raw
      .map((dimension) => dimension.trim())
      .filter((dimension): dimension is GoogleSearchConsoleDimension =>
        DEFAULT_GSC_DIMENSIONS.concat('date', 'searchAppearance').includes(
          dimension as GoogleSearchConsoleDimension,
        ),
      );

    return dimensions.length ? dimensions : DEFAULT_GSC_DIMENSIONS;
  }

  private async getAccessTokenFromCredential(
    user: User,
    brandId?: string,
  ): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const credential = await this.credentialsService.findOne({
      ...(brandId ? { brand: brandId } : {}),
      isConnected: true,
      isDeleted: false,
      organization: publicMetadata.organization,
      platform: CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
      user: publicMetadata.user,
    });

    if (!credential?.accessToken) {
      throw new HttpException(
        {
          detail:
            'Google Search Console credential not found. Please connect Search Console first.',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
