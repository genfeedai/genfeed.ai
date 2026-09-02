import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnUnauthorized,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { CreateBeehiivSubscribersDto } from '@api/services/integrations/beehiiv/dto/create-beehiiv-subscribers.dto';
import { BeehiivProviderError } from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  BeehiivSubscriberOutcomeSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/beehiiv')
export class BeehiivController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly beehiivService: BeehiivService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Connect Beehiiv by verifying API key and storing credential.
   * Lists publications to verify the key, then stores the credential
   * with the selected publication's ID and name.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { apiKey: string; brandId: string; publicationId?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId });

    const apiKey = body.apiKey?.trim();
    const brandId = body.brandId?.trim();
    const publicationId = body.publicationId?.trim();

    if (!apiKey || !brandId) {
      return returnBadRequest({
        detail: 'API key and brand ID are required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      // Verify API key by listing publications
      const publications = await this.beehiivService.listPublications(apiKey);

      if (!publications || publications.length === 0) {
        return returnBadRequest({
          detail:
            'No publications found for this API key. Please check your Beehiiv API key.',
          title: 'No publications',
        });
      }

      const publication = publicationId
        ? publications.find((item) => item.id === publicationId)
        : publications[0];

      if (!publication) {
        return returnBadRequest({
          detail:
            'The selected Beehiiv publication was not found for this API key.',
          title: 'Invalid publication',
        });
      }

      // Store credential with API key as accessToken. The publication id is the
      // account identity, so connecting a second publication adds an account
      // instead of replacing the first.
      const pending = await this.credentialsService.createPendingForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.BEEHIIV,
        { accessToken: apiKey },
      );

      const credential = await this.credentialsService.updateExternalProfile(
        pending.id,
        brand.organizationId,
        {
          handle: publication.name,
          id: publication.id,
          name: publication.name,
        },
      );

      this.loggerService.log(`${url} connected`, {
        publicationId: publication.id,
        publicationName: publication.name,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.logSafeError(url, error);
      return returnInternalServerError(
        'Failed to connect Beehiiv. Please verify your API key.',
      );
    }
  }

  /**
   * List publications for the connected Beehiiv account
   */
  @Get('publications')
  async listPublications(
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
    @Query('credentialId') credentialId?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId });

    if (!brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    try {
      const { apiKey } = await this.beehiivService.getDecryptedApiKey(
        user.organizationId?.toString() || '',
        brandId,
        credentialId,
      );

      const publications = await this.beehiivService.listPublications(apiKey);
      return { data: publications };
    } catch (error: unknown) {
      this.logSafeError(url, error);
      return returnInternalServerError('Failed to list Beehiiv publications');
    }
  }

  /**
   * Get subscribers for the connected publication
   */
  @Get('subscribers')
  async getSubscribers(
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('credentialId') credentialId?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId });

    if (!brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    try {
      const { apiKey, publicationId } =
        await this.beehiivService.getDecryptedApiKey(
          user.organizationId?.toString() || '',
          brandId,
          credentialId,
        );

      const subscribers = await this.beehiivService.getSubscribers(
        apiKey,
        publicationId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
      );
      return { data: subscribers };
    } catch (error: unknown) {
      this.logSafeError(url, error);
      return returnInternalServerError('Failed to get Beehiiv subscribers');
    }
  }

  /**
   * Add subscribers to the connected publication with one outcome per address.
   */
  @Post('subscribers')
  async createSubscribers(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateBeehiivSubscribersDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      addressCount: body.emails.length,
      brandId: body.brandId,
    });

    try {
      const { apiKey, publicationId } =
        await this.beehiivService.getDecryptedApiKey(
          user.organizationId?.toString() || '',
          body.brandId,
          body.credentialId,
        );

      const outcomes = await this.beehiivService.createSubscribers(
        apiKey,
        publicationId,
        body.emails,
        body.utmSource,
      );
      return serializeCollection(request, BeehiivSubscriberOutcomeSerializer, {
        docs: outcomes,
      });
    } catch (error: unknown) {
      this.logSafeError(url, error);
      if (
        error instanceof BeehiivProviderError &&
        error.code === 'authorization_failed'
      ) {
        return returnUnauthorized(error.message);
      }
      return returnInternalServerError('Failed to create Beehiiv subscribers');
    }
  }

  private logSafeError(logContext: string, error: unknown): void {
    this.loggerService.error(`${logContext} failed`, {
      error: error instanceof Error ? error.message : 'Unknown Beehiiv error',
    });
  }
}
