import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import type { AdOptimizationConfig } from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import type {
  RecommendationStatus,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  extractRequestContext,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/meta-ads/optimization')
export class MetaAdsOptimizationController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly recommendationsService: AdOptimizationRecommendationsService,
    private readonly configsService: AdOptimizationConfigsService,
    private readonly auditLogsService: AdOptimizationAuditLogsService,
    private readonly metaAdsService: MetaAdsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  // ─── Recommendations ──────────────────────────────────────────────────────

  @Get('recommendations')
  async listRecommendations(
    @CurrentUser() user: User,
    @Query('status') status?: RecommendationStatus,
    @Query('type') type?: RecommendationType,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.recommendationsService.findByOrganization(ctx.organizationId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      recommendationType: type,
      status,
    });
  }

  @Post('recommendations/:id/approve')
  async approveRecommendation(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const rec = await this.recommendationsService.approve(
      id,
      ctx.organizationId,
    );

    if (!rec) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }

    return rec;
  }

  @Post('recommendations/:id/reject')
  async rejectRecommendation(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started, reason: ${body?.reason || 'none'}`);

    const ctx = extractRequestContext(user);
    const rec = await this.recommendationsService.reject(
      id,
      ctx.organizationId,
    );

    if (!rec) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }

    return rec;
  }

  @Post('recommendations/:id/execute')
  async executeRecommendation(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const rec = await this.recommendationsService.findById(
      id,
      ctx.organizationId,
    );

    if (!rec) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }

    if (rec.status !== 'approved') {
      throw new BadRequestException(
        `Recommendation must be approved before execution. Current status: ${rec.status}`,
      );
    }

    const accessToken = await this.getAccessTokenFromCredential(user);

    switch (rec.recommendationType) {
      case 'pause':
        if (rec.entityType === 'campaign') {
          await this.metaAdsService.pauseCampaign(accessToken, rec.entityId);
        } else {
          await this.metaAdsService.pauseAd(accessToken, rec.entityId);
        }
        break;

      case 'budget_increase': {
        const suggestedAction = rec.suggestedAction || {};
        const increasePct = (suggestedAction.budgetIncreasePct as number) || 20;
        const maxBudget = (suggestedAction.maxDailyBudget as number) || 500;
        const currentSpend = rec.metrics.spend || 0;
        const daysInWindow = 7;
        const estimatedDailyBudget =
          daysInWindow > 0 ? currentSpend / daysInWindow : 0;
        const newBudget = Math.min(
          estimatedDailyBudget * (1 + increasePct / 100),
          maxBudget,
        );

        await this.metaAdsService.updateCampaignBudget(
          accessToken,
          rec.entityId,
          newBudget,
        );
        break;
      }

      case 'audience_expand':
        await this.metaAdsService.updateAdSet(accessToken, rec.entityId, {});
        break;

      case 'promote':
        this.loggerService.log(
          `${url} promote action for ${rec.entityId} is informational only`,
        );
        break;

      default:
        throw new BadRequestException(
          `Unknown recommendation type: ${rec.recommendationType}`,
        );
    }

    await this.recommendationsService.markExecuted(id, ctx.organizationId);

    return { success: true };
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  @Get('config')
  async getConfig(@CurrentUser() user: User) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const config = await this.configsService.findByOrganization(
      ctx.organizationId,
    );

    return config || { isEnabled: false };
  }

  @Put('config')
  async updateConfig(
    @CurrentUser() user: User,
    @Body() body: Partial<AdOptimizationConfig>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.configsService.upsert(ctx.organizationId, body);
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  @Get('audit-logs')
  async listAuditLogs(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.auditLogsService.findByOrganization(ctx.organizationId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.FACEBOOK,
      user: new Types.ObjectId(userId),
    });

    if (!credential?.oauthToken) {
      throw new NotFoundException(
        'Facebook credential not found. Please connect your Facebook account first.',
      );
    }

    return EncryptionUtil.decrypt(credential.oauthToken);
  }
}
