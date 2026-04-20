import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { OutreachCampaignsQueryDto } from '@api/collections/outreach-campaigns/dto/outreach-campaigns-query.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import {
  OutreachCampaign,
  type OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignTargetStatus,
  CampaignTargetType,
  CampaignType,
} from '@genfeedai/enums';
import { OutreachCampaignSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('OutreachCampaigns')
@AutoSwagger()
@Controller('outreach-campaigns')
export class OutreachCampaignsController extends BaseCRUDController<
  OutreachCampaignDocument,
  CreateOutreachCampaignDto,
  UpdateOutreachCampaignDto,
  // @ts-expect-error TS2344
  OutreachCampaignsQueryDto
> {
  constructor(
    public readonly outreachCampaignsService: OutreachCampaignsService,
    public readonly loggerService: LoggerService,
    private readonly campaignTargetsService: CampaignTargetsService,
    private readonly campaignDiscoveryService: CampaignDiscoveryService,
    private readonly campaignExecutorService: CampaignExecutorService,
  ) {
    super(
      loggerService,
      outreachCampaignsService as unknown,
      OutreachCampaignSerializer,
      OutreachCampaign.name,
      ['organization', 'brand', 'user', 'credential'],
    );
  }

  public buildFindAllPipeline(
    user: User,
    query: OutreachCampaignsQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const organizationId =
      query.organization || publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

    const brandId = publicMetadata.brand?.toString();
    if (brandId) {
      match.brand = brandId;
    }

    if (query.platform) {
      match.platform = query.platform;
    }

    if (query.campaignType) {
      match.campaignType = query.campaignType;
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.isActive !== undefined) {
      match.isActive = query.isActive;
    }

    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      { $sort: handleQuerySort(query.sort) },
    ];

    return pipeline;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a single campaign by ID' })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    return serializeSingle(request, OutreachCampaignSerializer, campaign);
  }

  public canUserModifyEntity(
    user: User,
    entity: OutreachCampaignDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      (entity.organization as unknown as { _id: string })?._id?.toString() ||
      entity.organization?.toString();

    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  /**
   * Start a campaign
   */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a campaign' })
  @ApiResponse({ description: 'Campaign started successfully', status: 200 })
  async startCampaign(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.outreachCampaignsService.start(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );
    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  /**
   * Pause a campaign
   */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a campaign' })
  @ApiResponse({ description: 'Campaign paused successfully', status: 200 })
  async pauseCampaign(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.outreachCampaignsService.pause(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );
    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  /**
   * Complete a campaign
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a campaign' })
  @ApiResponse({ description: 'Campaign completed successfully', status: 200 })
  async completeCampaign(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.outreachCampaignsService.complete(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );
    return serializeSingle(request, OutreachCampaignSerializer, data);
  }

  /**
   * Add targets to a campaign (manual URL addition)
   */
  @Post(':id/targets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add targets to a campaign' })
  @ApiResponse({ description: 'Targets added successfully', status: 200 })
  async addTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { urls: string[] },
  ): Promise<{ added: number; skipped: number }> {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    let added = 0;
    let skipped = 0;

    for (const url of body.urls) {
      const parsed = this.parseUrl(url);

      if (!parsed) {
        skipped++;
        continue;
      }

      const exists = await this.campaignTargetsService.targetExists(
        id,
        parsed.externalId,
      );

      if (exists) {
        skipped++;
        continue;
      }

      await this.campaignTargetsService.create({
        campaign: id,
        contentUrl: url,
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId: parsed.externalId,
        organization: campaign.organization,
        platform: parsed.platform,
        targetType: parsed.targetType,
      });

      added++;
    }

    if (added > 0) {
      await this.outreachCampaignsService.incrementTargetsCount(id, added);
    }

    return { added, skipped };
  }

  /**
   * Add DM recipients to a campaign (by username)
   */
  @Post(':id/dm-recipients')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add DM recipients to a campaign' })
  @ApiResponse({ description: 'Recipients added successfully', status: 200 })
  async addDmRecipients(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { usernames: string[] },
  ): Promise<{ added: number; skipped: number }> {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (campaign.campaignType !== CampaignType.DM_OUTREACH) {
      throw new BadRequestException('Campaign is not a DM outreach campaign');
    }

    let added = 0;
    let skipped = 0;

    // Normalize usernames: strip @, lowercase, dedup
    const normalizedUsernames = [
      ...new Set(
        body.usernames
          .map((u) => u.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];

    for (const username of normalizedUsernames) {
      // Check if already exists
      const exists = await this.campaignTargetsService.targetExists(
        id,
        username,
      );

      if (exists) {
        skipped++;
        continue;
      }

      await this.campaignTargetsService.create({
        campaign: id,
        contentUrl: `https://x.com/${username}`,
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId: username,
        organization: campaign.organization,
        platform: campaign.platform,
        // @ts-expect-error recipientUsername is a valid field
        recipientUsername: username,
        status: CampaignTargetStatus.PENDING,
        targetType: CampaignTargetType.DM_RECIPIENT,
      });

      added++;
    }

    if (added > 0) {
      await this.outreachCampaignsService.incrementTargetsCount(id, added);
    }

    return { added, skipped };
  }

  /**
   * Parse a single URL and return metadata
   */
  @Post('parse-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parse a URL and return metadata' })
  @ApiResponse({ description: 'URL parsed successfully', status: 200 })
  parseUrlEndpoint(@Body() body: { url: string }): {
    valid: boolean;
    platform?: CampaignPlatform;
    targetType?: CampaignTargetType;
    externalId?: string;
  } {
    const parsed = this.parseUrl(body.url);

    if (!parsed) {
      return { valid: false };
    }

    return {
      externalId: parsed.externalId,
      platform: parsed.platform,
      targetType: parsed.targetType,
      valid: true,
    };
  }

  /**
   * Get campaign analytics
   */
  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get campaign analytics' })
  @ApiResponse({ description: 'Returns campaign analytics', status: 200 })
  async getAnalytics(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{
    campaign: OutreachCampaignDocument;
    successRate: number;
    repliesPerHour: number;
    targetStats: {
      total: number;
      pending: number;
      scheduled: number;
      processing: number;
      replied: number;
      skipped: number;
      failed: number;
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const analytics = await this.outreachCampaignsService.getAnalytics(
      id,
      publicMetadata.organization,
    );
    const targetStats = await this.campaignTargetsService.getTargetStats(id);

    return {
      ...analytics,
      targetStats,
    };
  }

  /**
   * Get targets for a campaign
   */
  @Get(':id/targets')
  @ApiOperation({ summary: 'Get targets for a campaign' })
  @ApiResponse({ description: 'Returns campaign targets', status: 200 })
  async getTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<unknown[]> {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    return this.campaignTargetsService.findByCampaign(id);
  }

  /**
   * Discover targets for a campaign using AI-powered search
   */
  @Post(':id/targets/discover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discover targets using AI-powered search' })
  @ApiResponse({ description: 'Targets discovered and added', status: 200 })
  async discoverTargets(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { limit?: number; addToCampaign?: boolean },
  ): Promise<{
    discovered: number;
    added: number;
    targets: unknown[];
  }> {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (!campaign.discoveryConfig) {
      throw new BadRequestException(
        'Campaign has no discovery configuration. Add keywords, hashtags, or subreddits first.',
      );
    }

    const limit = body.limit || 50;
    const targets = await this.campaignDiscoveryService.discoverTargets(
      campaign,
      limit,
    );

    let added = 0;
    if (body.addToCampaign && targets.length > 0) {
      added =
        await this.campaignDiscoveryService.addDiscoveredTargetsToCampaign(
          campaign,
          targets,
        );
      await this.outreachCampaignsService.incrementTargetsCount(id, added);
    }

    return {
      added,
      discovered: targets.length,
      targets: body.addToCampaign ? [] : targets,
    };
  }

  /**
   * Preview a reply for a specific target
   */
  @Post(':id/targets/:targetId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview AI-generated reply for a target' })
  @ApiResponse({ description: 'Reply preview generated', status: 200 })
  async previewReply(
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @CurrentUser() user: User,
  ): Promise<{
    replyText: string;
    target: unknown;
  }> {
    const publicMetadata = getPublicMetadata(user);
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      publicMetadata.organization,
    );

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    const target = await this.campaignTargetsService.findById(targetId);

    if (!target) {
      throw new BadRequestException('Target not found');
    }

    if (target.campaign.toString() !== id) {
      throw new BadRequestException('Target does not belong to this campaign');
    }

    const replyText = await this.campaignExecutorService.previewReply(
      campaign,
      target,
    );

    return {
      replyText,
      target,
    };
  }

  /**
   * Parse URL to extract platform, type, and external ID
   */
  private parseUrl(url: string): {
    platform: CampaignPlatform;
    targetType: CampaignTargetType;
    externalId: string;
  } | null {
    try {
      const urlObj = new URL(url);

      // Twitter/X
      if (
        urlObj.hostname === 'twitter.com' ||
        urlObj.hostname === 'x.com' ||
        urlObj.hostname === 'www.twitter.com' ||
        urlObj.hostname === 'www.x.com'
      ) {
        const match = urlObj.pathname.match(/\/(?:[\w]+)\/status\/(\d+)/);
        if (match) {
          return {
            externalId: match[1],
            platform: CampaignPlatform.TWITTER,
            targetType: CampaignTargetType.TWEET,
          };
        }
      }

      // Reddit
      if (
        urlObj.hostname === 'reddit.com' ||
        urlObj.hostname === 'www.reddit.com' ||
        urlObj.hostname === 'old.reddit.com'
      ) {
        // Post URL: /r/subreddit/comments/postId/...
        const postMatch = urlObj.pathname.match(
          /\/r\/[\w]+\/comments\/([\w]+)/,
        );
        if (postMatch) {
          // Check if it's a comment (has /comment/ in path)
          const commentMatch = urlObj.pathname.match(
            /\/r\/[\w]+\/comments\/[\w]+\/[\w]+\/([\w]+)/,
          );
          if (commentMatch) {
            return {
              externalId: commentMatch[1],
              platform: CampaignPlatform.REDDIT,
              targetType: CampaignTargetType.REDDIT_COMMENT,
            };
          }

          return {
            externalId: postMatch[1],
            platform: CampaignPlatform.REDDIT,
            targetType: CampaignTargetType.REDDIT_POST,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
