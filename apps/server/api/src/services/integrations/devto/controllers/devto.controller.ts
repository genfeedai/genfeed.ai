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
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
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
@Controller('services/devto')
export class DevtoController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly devtoService: DevtoService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Connect dev.to by verifying the API key and storing the credential.
   * dev.to is API-key based (no OAuth): the key is validated by fetching the
   * authenticated user, whose handle/id are persisted alongside the credential.
   * POST /services/devto/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { apiKey: string; brandId: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId });

    if (!body.apiKey || !body.brandId) {
      return returnBadRequest({
        detail: 'API key and brand ID are required',
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

    const apiKey = body.apiKey.trim();
    let devtoUser: Awaited<ReturnType<DevtoService['getCurrentUser']>>;
    try {
      // Verify the API key by fetching the authenticated dev.to user
      devtoUser = await this.devtoService.getCurrentUser(apiKey);
    } catch (error: unknown) {
      // dev.to has one fixed API host, so the only reason the user can fix
      // in the form is a refused key.
      const code =
        classifyApiKeyConnectError(error) ===
        ApiKeyConnectErrorCode.KEY_REJECTED
          ? ApiKeyConnectErrorCode.KEY_REJECTED
          : ApiKeyConnectErrorCode.UNKNOWN;
      this.loggerService.warn(`${url} refused`, { code });
      throw createApiKeyConnectException(code);
    }

    if (!devtoUser?.id) {
      throw createApiKeyConnectException(ApiKeyConnectErrorCode.KEY_REJECTED);
    }

    const pending = await this.credentialsService.createPendingForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.DEV_TO,
      { accessToken: apiKey },
    );

    // Identity reconciliation decides reconnect vs. additional account, so a
    // brand can hold more than one dev.to author.
    const credential = await this.credentialsService.updateExternalProfile(
      pending.id,
      brand.organizationId,
      {
        handle: devtoUser.username,
        id: String(devtoUser.id),
        name: devtoUser.name,
      },
    );

    this.loggerService.log(`${url} connected`, {
      devtoUserId: devtoUser.id,
      username: devtoUser.username,
    });

    return serializeSingle(request, CredentialSerializer, credential);
  }
}
