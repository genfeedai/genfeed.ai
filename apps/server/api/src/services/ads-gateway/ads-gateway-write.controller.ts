import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import {
  type AdsGatewayAdapterContextInput,
  AdsGatewayRequestContextService,
} from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type {
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

const ADS_WRITE_ROLES = [MemberRole.OWNER, MemberRole.ADMIN] as const;
const ADS_WRITE_SCOPES = [ApiKeyScope.ADMIN] as const;

type CreateCampaignBody = AdsGatewayAdapterContextInput & CreateCampaignInput;
type UpdateCampaignBody = AdsGatewayAdapterContextInput & UpdateCampaignInput;
type CreateAdSetBody = AdsGatewayAdapterContextInput & CreateAdSetInput;
type CreateAdBody = AdsGatewayAdapterContextInput & CreateAdInput;

@AutoSwagger()
@Controller('ads')
@UseGuards(RolesGuard)
export class AdsGatewayWriteController {
  private readonly constructorName = 'AdsGatewayController';

  constructor(
    private readonly adsGatewayService: AdsGatewayService,
    private readonly requestContextService: AdsGatewayRequestContextService,
    private readonly logger: LoggerService,
  ) {}

  @Post(':platform/campaigns')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  @ApiOperation({
    operationId: 'AdsGatewayController.createCampaign',
    summary: 'createCampaign',
  })
  async createCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body() body: CreateCampaignBody,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    this.assertPausedOnlyStatus(body.status);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );

    return adapter.createCampaign(ctx, input);
  }

  @Put(':platform/campaigns/:campaignId')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  @ApiOperation({
    operationId: 'AdsGatewayController.updateCampaign',
    summary: 'updateCampaign',
  })
  async updateCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateCampaignBody,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    this.assertPausedOnlyStatus(body.status);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );

    return adapter.updateCampaign(ctx, campaignId, input);
  }

  @Post(':platform/adsets')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  @ApiOperation({
    operationId: 'AdsGatewayController.createAdSet',
    summary: 'createAdSet',
  })
  async createAdSet(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body() body: CreateAdSetBody,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );

    return adapter.createAdSet(ctx, input);
  }

  @Post(':platform/ads')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  @ApiOperation({
    operationId: 'AdsGatewayController.createAd',
    summary: 'createAd',
  })
  async createAd(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body() body: CreateAdBody,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );

    return adapter.createAd(ctx, input);
  }

  private assertPausedOnlyStatus(status: unknown): void {
    if (!isAcceptedCampaignStatus(status)) {
      throw new BadRequestException(INVALID_CAMPAIGN_STATUS_MESSAGE);
    }
  }
}
