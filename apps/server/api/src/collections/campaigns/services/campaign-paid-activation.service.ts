import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  ApproveCampaignSpendDto,
  PrepareCampaignActivationDto,
} from '@api/collections/campaigns/dto/prepare-campaign-activation.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { UNIFIED_PAUSED_CAMPAIGN_STATUS } from '@api/services/ads-gateway/ads-campaign-status.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignPaidActivationStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import type { ICampaignPaidActivation } from '@genfeedai/contracts/interfaces';
import type { CampaignPaidActivation } from '@genfeedai/prisma';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

const SPEND_CONFIRMATION = 'confirm';

export function toCampaignPaidActivation(
  row: CampaignPaidActivation,
): ICampaignPaidActivation {
  return {
    adAccountId: row.adAccountId,
    campaignId: row.campaignId,
    credentialId: row.credentialId,
    currency: row.currency,
    externalAdId: row.externalAdId,
    externalAdSetId: row.externalAdSetId,
    externalCampaignId: row.externalCampaignId,
    failureReason: row.failureReason,
    id: row.id,
    platform: row.platform,
    postIds: row.postIds,
    spendApprovedAt: row.spendApprovedAt?.toISOString() ?? null,
    status: row.status as ContentCampaignPaidActivationStatus,
  };
}

@Injectable()
export class CampaignPaidActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adsGateway: AdsGatewayService,
    private readonly requestContext: AdsGatewayRequestContextService,
  ) {}

  async list(
    organizationId: string,
    campaignId: string,
  ): Promise<ICampaignPaidActivation[]> {
    await this.requireCampaign(organizationId, campaignId);
    const rows = await this.prisma.campaignPaidActivation.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: scopedWhere(organizationId, { campaignId }),
    });
    return rows.map(toCampaignPaidActivation);
  }

  async prepare(
    organizationId: string,
    user: AuthenticatedUser,
    campaignId: string,
    dto: PrepareCampaignActivationDto,
  ): Promise<ICampaignPaidActivation> {
    const campaign = await this.requireCampaign(organizationId, campaignId);
    const platform = this.requestContext.validatePlatform(dto.platform);
    const posts = await this.requireApprovedPosts(
      organizationId,
      campaign.brandId,
      campaignId,
      dto.postIds,
    );
    const missingLinks = posts.filter((post) => !post.url);
    if (missingLinks.length > 0) {
      throw new BadRequestException(
        'Approved Campaign content is missing a destination URL, so a provider ad cannot be created',
      );
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.campaignPaidActivation.findFirst({
        where: scopedWhere(organizationId, {
          campaignId,
          idempotencyKey: dto.idempotencyKey,
        }),
      });
      if (existing) {
        return toCampaignPaidActivation(existing);
      }
    }

    const reused = await this.prisma.campaignPaidActivation.findFirst({
      where: scopedWhere(organizationId, {
        adAccountId: dto.adAccountId,
        campaignId,
        credentialId: dto.credentialId,
        platform,
        status: ContentCampaignPaidActivationStatus.PAUSED,
      }),
    });
    if (reused) {
      return toCampaignPaidActivation(reused);
    }

    const ctx = await this.requestContext.createAdapterContext(user, platform, {
      adAccountId: dto.adAccountId,
      credentialId: dto.credentialId,
    });
    const adapter = this.adsGateway.getAdapter(platform);

    let externalCampaignId: string | undefined;
    let externalAdSetId: string | undefined;
    let externalAdId: string | undefined;
    try {
      const providerCampaign = await adapter.createCampaign(ctx, {
        name: campaign.name,
        objective: campaign.objective || 'OUTCOME_TRAFFIC',
        status: UNIFIED_PAUSED_CAMPAIGN_STATUS,
      });
      externalCampaignId = providerCampaign.id;
      const adSet = await adapter.createAdSet(ctx, {
        campaignId: providerCampaign.id,
        name: `${campaign.name} ad set`,
        targeting: dto.targeting ?? {},
      });
      externalAdSetId = adSet.id;
      const firstPost = posts[0];
      const ad = await adapter.createAd(ctx, {
        adSetId: adSet.id,
        creative: { linkUrl: firstPost?.url ?? '' },
        name: firstPost?.id ?? campaign.name,
      });
      externalAdId = ad.id;
    } catch (error) {
      const failed = await this.prisma.campaignPaidActivation.create({
        data: {
          adAccountId: dto.adAccountId,
          brandId: campaign.brandId,
          campaignId,
          credentialId: dto.credentialId,
          externalAdId: externalAdId ?? null,
          externalAdSetId: externalAdSetId ?? null,
          externalCampaignId: externalCampaignId ?? null,
          failureReason: getErrorMessage(error),
          idempotencyKey: dto.idempotencyKey ?? null,
          organizationId,
          platform,
          postIds: posts.map((post) => post.id),
          status: ContentCampaignPaidActivationStatus.FAILED,
          userId: user.userId ?? user.id ?? '',
        },
      });
      return toCampaignPaidActivation(failed);
    }

    const created = await this.prisma.campaignPaidActivation.create({
      data: {
        adAccountId: dto.adAccountId,
        brandId: campaign.brandId,
        campaignId,
        credentialId: dto.credentialId,
        externalAdId: externalAdId ?? null,
        externalAdSetId: externalAdSetId ?? null,
        externalCampaignId: externalCampaignId ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        organizationId,
        platform,
        postIds: posts.map((post) => post.id),
        status: ContentCampaignPaidActivationStatus.PAUSED,
        userId: user.userId ?? user.id ?? '',
      },
    });
    return toCampaignPaidActivation(created);
  }

  async approveSpend(
    organizationId: string,
    userId: string,
    campaignId: string,
    activationId: string,
    dto: ApproveCampaignSpendDto,
  ): Promise<ICampaignPaidActivation> {
    if (dto.confirm !== SPEND_CONFIRMATION) {
      throw new BadRequestException(
        'Spend approval requires an explicit confirm value',
      );
    }
    await this.requireCampaign(organizationId, campaignId);
    const existing = await this.prisma.campaignPaidActivation.findFirst({
      where: scopedWhere(organizationId, {
        campaignId,
        id: activationId,
      }),
    });
    if (!existing) {
      throw new NotFoundException('Campaign paid activation', activationId);
    }
    if (existing.status !== ContentCampaignPaidActivationStatus.PAUSED) {
      throw new BadRequestException(
        'Only a paused activation can receive spend approval',
      );
    }
    if (existing.spendApprovedAt) {
      return toCampaignPaidActivation(existing);
    }

    const spendApprovedAt = new Date();
    const transition = await this.prisma.campaignPaidActivation.updateMany({
      data: {
        spendApprovedAt,
        spendApprovedByUserId: userId,
      },
      where: scopedWhere(organizationId, { id: existing.id }),
    });
    if (transition.count !== 1) {
      throw new NotFoundException('Campaign paid activation', activationId);
    }
    return toCampaignPaidActivation({
      ...existing,
      spendApprovedAt,
      spendApprovedByUserId: userId,
    });
  }

  private async requireCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }
    return campaign;
  }

  private async requireApprovedPosts(
    organizationId: string,
    brandId: string,
    campaignId: string,
    postIds?: string[],
  ) {
    const uniqueIds = postIds ? [...new Set(postIds)] : undefined;
    const posts = await this.prisma.post.findMany({
      select: { id: true, reviewDecision: true, url: true },
      where: scopedWhere(organizationId, {
        brandId,
        campaignId,
        reviewDecision: PersistedReviewDecision.APPROVED,
        ...(uniqueIds ? { id: { in: uniqueIds } } : {}),
      }),
    });
    if (posts.length === 0) {
      throw new BadRequestException(
        'This Campaign has no approved content that can be promoted',
      );
    }
    if (uniqueIds && posts.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Every selected post must be an approved member of this Campaign',
      );
    }
    return posts;
  }
}
