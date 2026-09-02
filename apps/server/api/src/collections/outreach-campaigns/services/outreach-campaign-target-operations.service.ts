import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import type { AddCampaignTargetsDto } from '@api/collections/outreach-campaigns/dto/add-campaign-targets.dto';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { parseCampaignTargetUrl } from '@api/collections/outreach-campaigns/services/campaign-target-url.util';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import {
  requireExecutableOutreachPair,
  requireMatchingOutreachTargetPlatform,
} from '@api/services/campaign/outreach-capability.util';
import {
  CampaignDiscoverySource,
  type CampaignPlatform,
  CampaignTargetStatus,
  CampaignTargetType,
  CampaignType,
} from '@genfeedai/enums';
import { BadRequestException, Injectable } from '@nestjs/common';

interface DiscoverTargetsOptions {
  addToCampaign?: boolean;
  limit?: number;
}

interface ParsedUrlResult {
  externalId?: string;
  platform?: CampaignPlatform;
  targetType?: CampaignTargetType;
  valid: boolean;
}

@Injectable()
export class OutreachCampaignTargetOperationsService {
  constructor(
    private readonly campaignTargetsService: CampaignTargetsService,
    private readonly campaignDiscoveryService: CampaignDiscoveryService,
    private readonly campaignExecutorService: CampaignExecutorService,
    private readonly outreachCampaignsService: OutreachCampaignsService,
  ) {}

  async addTargets(
    id: string,
    user: User,
    body: AddCampaignTargetsDto,
  ): Promise<{ added: number; skipped: number }> {
    const campaign = await this.findCampaign(id, user);

    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });

    if (body.targetType === CampaignTargetType.DM_RECIPIENT) {
      return this.addDmRecipients(campaign, id, body.usernames ?? []);
    }

    return this.addUrlTargets(campaign, id, body.urls ?? []);
  }

  parseUrl(url: string): ParsedUrlResult {
    const parsed = parseCampaignTargetUrl(url);

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

  async getTargets(id: string, user: User): Promise<unknown[]> {
    const campaign = await this.findCampaign(id, user);

    return this.campaignTargetsService.findByCampaign(
      id,
      campaign.organizationId,
    );
  }

  async discoverTargets(
    id: string,
    user: User,
    options: DiscoverTargetsOptions,
  ): Promise<{ added: number; discovered: number; targets: unknown[] }> {
    const campaign = await this.findCampaign(id, user);

    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });

    if (!campaign.discoveryConfig) {
      throw new BadRequestException(
        'Campaign has no discovery configuration. Add keywords, hashtags, or subreddits first.',
      );
    }

    const targets = await this.campaignDiscoveryService.discoverTargets(
      campaign,
      options.limit || 50,
    );

    let added = 0;
    if (options.addToCampaign && targets.length > 0) {
      added =
        await this.campaignDiscoveryService.addDiscoveredTargetsToCampaign(
          campaign,
          targets,
        );
    }

    return {
      added,
      discovered: targets.length,
      targets: options.addToCampaign ? [] : targets,
    };
  }

  async previewReply(
    id: string,
    targetId: string,
    user: User,
  ): Promise<{ replyText: string; target: unknown }> {
    const campaign = await this.findCampaign(id, user);

    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });

    const target = await this.campaignTargetsService.findById(
      targetId,
      campaign.organizationId,
      id,
    );

    if (!target) {
      throw new NotFoundException('CampaignTarget', targetId);
    }

    const replyText = await this.campaignExecutorService.previewReply(
      campaign,
      target,
    );

    return { replyText, target };
  }

  private async findCampaign(
    id: string,
    user: User,
  ): Promise<OutreachCampaignDocument> {
    const campaign = await this.outreachCampaignsService.findOneById(
      id,
      user.organizationId,
      user.brandId,
    );

    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }

    return campaign;
  }

  private async addUrlTargets(
    campaign: OutreachCampaignDocument,
    id: string,
    urls: string[],
  ): Promise<{ added: number; skipped: number }> {
    let skipped = 0;
    const parsedByExternalId = new Map<
      string,
      {
        platform: CampaignPlatform;
        targetType: CampaignTargetType;
        url: string;
      }
    >();

    for (const url of urls) {
      const parsed = parseCampaignTargetUrl(url);

      if (!parsed || parsedByExternalId.has(parsed.externalId)) {
        skipped++;
        continue;
      }

      requireMatchingOutreachTargetPlatform({
        campaignPlatform: campaign.platform,
        targetPlatform: parsed.platform,
      });

      parsedByExternalId.set(parsed.externalId, { ...parsed, url });
    }

    const existingExternalIds =
      await this.campaignTargetsService.findExistingExternalIds(
        id,
        campaign.organizationId,
        [...parsedByExternalId.keys()],
      );
    const targets: Parameters<
      CampaignTargetsService['createManyForCampaign']
    >[2] = [];

    for (const [externalId, parsed] of parsedByExternalId) {
      if (existingExternalIds.has(externalId)) {
        skipped++;
        continue;
      }

      targets.push({
        campaignId: id,
        contentUrl: parsed.url,
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId,
        organizationId: campaign.organizationId,
        platform: parsed.platform,
        targetType: parsed.targetType,
      });
    }

    const added = await this.campaignTargetsService.createManyForCampaign(
      id,
      campaign.organizationId,
      targets,
    );

    return { added, skipped };
  }

  private async addDmRecipients(
    campaign: OutreachCampaignDocument,
    id: string,
    usernames: string[],
  ): Promise<{ added: number; skipped: number }> {
    if (campaign.campaignType !== CampaignType.DM_OUTREACH) {
      throw new BadRequestException('Campaign is not a DM outreach campaign');
    }
    if (!campaign.platform) {
      throw new BadRequestException('Campaign platform is missing');
    }

    const platform = campaign.platform as CampaignPlatform;
    let skipped = 0;
    const normalizedUsernames = [
      ...new Set(
        usernames
          .map((username) => username.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];
    const existingExternalIds =
      await this.campaignTargetsService.findExistingExternalIds(
        id,
        campaign.organizationId,
        normalizedUsernames,
      );
    const targets: Parameters<
      CampaignTargetsService['createManyForCampaign']
    >[2] = [];

    for (const username of normalizedUsernames) {
      if (existingExternalIds.has(username)) {
        skipped++;
        continue;
      }

      targets.push({
        campaignId: id,
        contentUrl: `https://x.com/${username}`,
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId: username,
        organizationId: campaign.organizationId,
        platform,
        recipientUsername: username,
        status: CampaignTargetStatus.PENDING,
        targetType: CampaignTargetType.DM_RECIPIENT,
      });
    }

    const added = await this.campaignTargetsService.createManyForCampaign(
      id,
      campaign.organizationId,
      targets,
    );

    return { added, skipped };
  }
}
