import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import type { User } from '@clerk/backend';
import { CredentialSerializer } from '@genfeedai/serializers';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

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
   * with the first publication's ID and name.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { apiKey: string; brandId: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId });

    const publicMetadata = getPublicMetadata(user);

    if (!body.apiKey || !body.brandId) {
      return returnBadRequest({
        detail: 'API key and brand ID are required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(body.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      // Verify API key by listing publications
      const publications = await this.beehiivService.listPublications(
        body.apiKey,
      );

      if (!publications || publications.length === 0) {
        return returnBadRequest({
          detail:
            'No publications found for this API key. Please check your Beehiiv API key.',
          title: 'No publications',
        });
      }

      // Use the first publication by default
      const publication = publications[0];

      // Store credential with API key as accessToken
      const credential = await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.BEEHIIV,
        {
          accessToken: body.apiKey,
          externalHandle: publication.name,
          externalId: publication.id,
          isConnected: true,
        },
      );

      this.loggerService.log(`${url} connected`, {
        publicationId: publication.id,
        publicationName: publication.name,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
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
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId });

    const publicMetadata = getPublicMetadata(user);

    if (!brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    try {
      const { apiKey } = await this.beehiivService.getDecryptedApiKey(
        publicMetadata.organization?.toString() || '',
        brandId,
      );

      const publications = await this.beehiivService.listPublications(apiKey);
      return { data: publications };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
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
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId });

    const publicMetadata = getPublicMetadata(user);

    if (!brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    try {
      const { apiKey, publicationId } =
        await this.beehiivService.getDecryptedApiKey(
          publicMetadata.organization?.toString() || '',
          brandId,
        );

      const subscribers = await this.beehiivService.getSubscribers(
        apiKey,
        publicationId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
      );
      return { data: subscribers };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to get Beehiiv subscribers');
    }
  }

  /**
   * Add a subscriber to the connected publication
   */
  @Post('subscribers')
  async createSubscriber(
    @CurrentUser() user: User,
    @Body() body: { brandId: string; email: string; utmSource?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId, email: body.email });

    const publicMetadata = getPublicMetadata(user);

    if (!body.brandId || !body.email) {
      return returnBadRequest({
        detail: 'Brand ID and email are required',
        title: 'Invalid payload',
      });
    }

    try {
      const { apiKey, publicationId } =
        await this.beehiivService.getDecryptedApiKey(
          publicMetadata.organization?.toString() || '',
          body.brandId,
        );

      const subscriber = await this.beehiivService.createSubscriber(
        apiKey,
        publicationId,
        body.email,
        body.utmSource,
      );
      return { data: subscriber };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to create Beehiiv subscriber');
    }
  }
}
