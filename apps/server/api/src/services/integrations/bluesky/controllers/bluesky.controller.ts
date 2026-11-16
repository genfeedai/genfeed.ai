import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  classifyApiKeyConnectError,
  createApiKeyConnectException,
} from '@api/services/integrations/_shared/api-key-connect-error.util';
import { ConnectBlueskyCredentialDto } from '@api/services/integrations/bluesky/dto/connect-bluesky-credential.dto';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import {
  normalizeBlueskyIdentifier,
  parseBlueskyServiceUrl,
} from '@api/services/integrations/bluesky/utils/bluesky-service-url.util';
import {
  ApiKeyConnectErrorCode,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { CredentialSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/bluesky')
export class BlueskyController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Connect a Bluesky account with its handle and an app password. The pair is
   * checked by signing in; only the app password is stored (encrypted), never
   * the account password.
   * POST /services/bluesky/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: ConnectBlueskyCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId });

    const identifier = normalizeBlueskyIdentifier(body.handle ?? '');
    const appPassword =
      typeof body.appPassword === 'string' ? body.appPassword.trim() : '';
    if (!identifier || !appPassword || !body.brandId) {
      return returnBadRequest({
        detail: 'Handle, app password and brand ID are required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: user.organizationId,
    });
    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const parsedServiceUrl = parseBlueskyServiceUrl(body.serviceUrl);
    if (!parsedServiceUrl.ok) {
      throw createApiKeyConnectException(parsedServiceUrl.code);
    }
    const { serviceUrl } = parsedServiceUrl;

    let session: Awaited<ReturnType<BlueskyService['createSession']>>;
    try {
      session = await this.blueskyService.createSession(
        serviceUrl,
        identifier,
        appPassword,
      );
    } catch (error: unknown) {
      // Bluesky has one answer for a wrong handle and a wrong password, so
      // both surface as a refused key.
      const code = classifyApiKeyConnectError(error);
      this.loggerService.warn(`${url} refused`, { code });
      throw createApiKeyConnectException(
        code === ApiKeyConnectErrorCode.API_NOT_FOUND
          ? ApiKeyConnectErrorCode.UNKNOWN
          : code,
      );
    }

    const profile = await this.blueskyService.getPublicProfile(session.did);

    const pending = await this.credentialsService.createPendingForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.BLUESKY,
    );

    // The DID is the account identity: a handle can change, a DID cannot, so
    // reconnecting the same account updates it and a second account is added.
    const credential = await this.credentialsService.connectAccount(
      pending.id,
      brand.organizationId,
      {
        avatarUrl: profile.avatar,
        bannerUrl: profile.banner,
        handle: session.handle,
        id: session.did,
        name: profile.displayName || session.handle,
      },
      {
        accessToken: appPassword,
        description: serviceUrl,
        isConnected: true,
        isDeleted: false,
      },
    );

    this.loggerService.log(`${url} connected`, { did: session.did });

    return serializeSingle(request, CredentialSerializer, credential);
  }
}
