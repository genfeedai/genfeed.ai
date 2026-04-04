import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/clerk/clerk.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import type { User } from '@clerk/backend';
import type {
  AdsAdapterContext,
  AdsPlatform,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';

const VALID_PLATFORMS: AdsPlatform[] = ['meta', 'google', 'tiktok'];

@AutoSwagger()
@Controller('ads')
export class AdsGatewayController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly adsGatewayService: AdsGatewayService,
    private readonly credentialsService: CredentialsService,
    private readonly logger: LoggerService,
  ) {}

  // ─── Read Endpoints ──────────────────────────────────────────────────────

  @Get('compare')
  async comparePlatforms(
    @CurrentUser() user: User,
    @Query('platforms') platformsStr: string,
    @Query('credentialIds') credentialIdsStr: string,
    @Query('adAccountIds') adAccountIdsStr: string,
    @Query('datePreset') datePreset?: string,
    @Query('loginCustomerIds') loginCustomerIdsStr?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started`);

    const reqCtx = extractRequestContext(user);
    const platforms = platformsStr.split(',') as AdsPlatform[];
    const credentialIds = credentialIdsStr.split(',');
    const adAccountIds = adAccountIdsStr.split(',');
    const loginCustomerIds = loginCustomerIdsStr?.split(',');

    if (
      platforms.length !== credentialIds.length ||
      platforms.length !== adAccountIds.length
    ) {
      throw new BadRequestException(
        'platforms, credentialIds, and adAccountIds must have the same number of elements',
      );
    }

    for (const p of platforms) {
      this.validatePlatform(p);
    }

    const accessTokens = await Promise.all(
      credentialIds.map((id) =>
        this.resolveAccessToken(id, reqCtx.organizationId),
      ),
    );

    const contexts = platforms.map((platform, i) => ({
      ctx: this.buildContext({
        accessToken: accessTokens[i],
        adAccountId: adAccountIds[i],
        credentialId: credentialIds[i],
        loginCustomerId: loginCustomerIds?.[i],
        organizationId: reqCtx.organizationId,
      }),
      platform,
    }));

    return this.adsGatewayService.comparePlatforms(contexts, datePreset);
  }

  @Get(':platform/accounts')
  async getAdAccounts(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId: '',
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.getAdAccounts(ctx);
  }

  @Get(':platform/campaigns')
  async listCampaigns(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.listCampaigns(ctx);
  }

  @Get(':platform/campaigns/:campaignId/insights')
  async getCampaignInsights(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('datePreset') datePreset?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    const params: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
    } = {};
    if (datePreset) params.datePreset = datePreset;
    if (since && until) params.timeRange = { since, until };

    return adapter.getCampaignInsights(ctx, campaignId, params);
  }

  @Get(':platform/top-performers')
  async getTopPerformers(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
    @Query('datePreset') datePreset?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.getTopPerformers(ctx, {
      datePreset,
      limit: limit ? Number(limit) : undefined,
      metric,
    });
  }

  @Get(':platform/adsets')
  async listAdSets(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('campaignId') campaignId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.listAdSets(ctx, campaignId);
  }

  @Get(':platform/ads')
  async listAds(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('adSetId') adSetId?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.listAds(ctx, adSetId);
  }

  // ─── Write Endpoints ──────────────────────────────────────────────────────

  @Post(':platform/campaigns')
  async createCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateCampaignInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createCampaign(ctx, input);
  }

  @Put(':platform/campaigns/:campaignId')
  async updateCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & UpdateCampaignInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.updateCampaign(ctx, campaignId, input);
  }

  @Post(':platform/campaigns/:campaignId/pause')
  async pauseCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    },
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const accessToken = await this.resolveAccessToken(
      body.credentialId,
      reqCtx.organizationId,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId: body.adAccountId,
      credentialId: body.credentialId,
      loginCustomerId: body.loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    await adapter.pauseCampaign(ctx, campaignId);
    return { success: true };
  }

  @Post(':platform/adsets')
  async createAdSet(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateAdSetInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createAdSet(ctx, input);
  }

  @Post(':platform/ads')
  async createAd(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateAdInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createAd(ctx, input);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async resolveAccessToken(
    credentialId: string,
    organizationId: string,
  ): Promise<string> {
    const credential = await this.credentialsService.findOne({
      _id: new Types.ObjectId(credentialId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!credential?.accessToken) {
      throw new UnauthorizedException(
        `Credential ${credentialId} not found or missing access token`,
      );
    }

    return credential.accessToken;
  }

  private validatePlatform(platform: string): AdsPlatform {
    if (!VALID_PLATFORMS.includes(platform as AdsPlatform)) {
      throw new BadRequestException(
        `Invalid platform: ${platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
      );
    }
    return platform as AdsPlatform;
  }

  private buildContext(params: {
    credentialId: string;
    accessToken: string;
    adAccountId: string;
    loginCustomerId?: string;
    organizationId: string;
    brandId?: string;
  }): AdsAdapterContext {
    return {
      accessToken: params.accessToken,
      adAccountId: params.adAccountId,
      brandId: params.brandId,
      credentialId: params.credentialId,
      loginCustomerId: params.loginCustomerId,
      organizationId: params.organizationId,
    };
  }
}
