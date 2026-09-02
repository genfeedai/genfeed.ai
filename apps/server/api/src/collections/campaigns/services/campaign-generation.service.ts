import type { GenerateCampaignContentDto } from '@api/collections/campaigns/dto/generate-campaign-content.dto';
import {
  campaignItemOutcome,
  canApplyContentCampaignLifecycle,
  toCampaign,
} from '@api/collections/campaigns/services/campaign.utils';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignItemKind,
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  ContentIntelligencePlatform,
  fromPrismaCredentialPlatform,
  ReleaseStatus,
} from '@genfeedai/enums';
import type {
  ICampaignLifecycleItemOutcome,
  ICampaignLifecycleResult,
} from '@genfeedai/interfaces';
import type { Campaign, Credential } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class CampaignGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly postGroupsService: PostGroupsService,
  ) {}

  async generate(
    organizationId: string,
    userId: string,
    id: string,
    dto: GenerateCampaignContentDto,
  ): Promise<ICampaignLifecycleResult> {
    const campaign = await this.requireCampaign(organizationId, id);
    const status = campaign.status as ContentCampaignStatus;
    if (
      !canApplyContentCampaignLifecycle(
        status,
        ContentCampaignLifecycleAction.GENERATE,
      )
    ) {
      throw new BadRequestException(
        `Campaign '${id}' cannot generate from ${status}`,
      );
    }

    const credentials = await this.loadCredentials(campaign, dto.credentialIds);
    if (credentials.length === 0) {
      throw new BadRequestException(
        'No connected credentials are available for this campaign brand',
      );
    }

    const planned = await this.plannedCredentialIds(campaign);
    const items: ICampaignLifecycleItemOutcome[] = [];
    const pending: Credential[] = [];
    for (const credential of credentials) {
      if (planned.has(credential.id)) {
        items.push(
          campaignItemOutcome({
            id: credential.id,
            kind: ContentCampaignItemKind.RELEASE,
            reason: 'Credential already has campaign content',
            status: ContentCampaignItemOutcomeStatus.SKIPPED,
          }),
        );
        continue;
      }
      pending.push(credential);
    }

    if (pending.length === 0) {
      return {
        action: ContentCampaignLifecycleAction.GENERATE,
        campaign: toCampaign(campaign),
        id: campaign.id,
        items,
      };
    }

    const captions = await this.captionsForCredentials(campaign, pending);
    const targets = pending.flatMap((credential, index) => {
      const platform = fromPrismaCredentialPlatform(credential.platform);
      if (!platform) {
        items.push(
          campaignItemOutcome({
            id: credential.id,
            kind: ContentCampaignItemKind.RELEASE,
            reason: 'Credential platform is unsupported',
            retryable: true,
            status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
          }),
        );
        return [];
      }
      return [
        {
          caption: captions[index] ?? this.campaignCopy(campaign),
          credentialId: credential.id,
          platform,
        },
      ];
    });

    if (targets.length === 0) {
      return {
        action: ContentCampaignLifecycleAction.GENERATE,
        campaign: toCampaign(campaign),
        id: campaign.id,
        items,
      };
    }

    try {
      const release = await this.postGroupsService.create(
        organizationId,
        userId,
        {
          baseContent: this.campaignCopy(campaign),
          brandId: campaign.brandId,
          campaignId: campaign.id,
          ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
          status: ReleaseStatus.DRAFT,
          targets,
          timezone: 'UTC',
          title: campaign.name,
        },
        dto.idempotencyKey,
        {
          ...(dto.contentRunId ? { contentRunId: dto.contentRunId } : {}),
          source: dto.source ?? 'campaign',
          ...(dto.workflowExecutionId
            ? { workflowExecutionId: dto.workflowExecutionId }
            : {}),
        },
      );

      if (dto.contentRunId) {
        await this.prisma.post.updateMany({
          data: { contentRunId: dto.contentRunId },
          where: scopedWhere(organizationId, { groupId: release.id }),
        });
      }

      for (const target of release.targets ?? []) {
        items.push(
          campaignItemOutcome({
            executionState: target.executionState,
            id: target.id,
            kind: ContentCampaignItemKind.POST,
            status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
          }),
        );
      }
    } catch (error: unknown) {
      this.logger.warn('Campaign generation failed', {
        campaignId: campaign.id,
        error: getErrorMessage(error),
        organizationId,
      });
      for (const credential of pending) {
        items.push(
          campaignItemOutcome({
            id: credential.id,
            kind: ContentCampaignItemKind.RELEASE,
            reason: getErrorMessage(error),
            retryable: true,
            status: ContentCampaignItemOutcomeStatus.FAILED,
          }),
        );
      }
    }

    return {
      action: ContentCampaignLifecycleAction.GENERATE,
      campaign: toCampaign(campaign),
      id: campaign.id,
      items,
    };
  }

  private async loadCredentials(
    campaign: Campaign,
    credentialIds: string[] | undefined,
  ): Promise<Credential[]> {
    const uniqueIds = credentialIds ? [...new Set(credentialIds)] : [];
    const rows = await this.prisma.credential.findMany({
      orderBy: [{ platform: 'asc' }, { id: 'asc' }],
      where: scopedWhere(campaign.organizationId, {
        brandId: campaign.brandId,
        isConnected: true,
        ...(uniqueIds.length > 0 ? { id: { in: uniqueIds } } : {}),
      }),
    });
    if (uniqueIds.length === 0) {
      return rows;
    }
    const found = new Set(rows.map((row) => row.id));
    const missing = uniqueIds.find((credentialId) => !found.has(credentialId));
    if (missing) {
      throw new BadRequestException(
        `Credential '${missing}' is unavailable in this campaign's brand`,
      );
    }
    return rows;
  }

  private async plannedCredentialIds(campaign: Campaign): Promise<Set<string>> {
    const rows = await this.prisma.post.findMany({
      select: { credentialId: true },
      where: scopedWhere(campaign.organizationId, {
        brandId: campaign.brandId,
        campaignId: campaign.id,
        credentialId: { not: null },
        parentId: null,
      }),
    });
    return new Set(
      rows
        .map((row) => row.credentialId)
        .filter((credentialId): credentialId is string =>
          Boolean(credentialId),
        ),
    );
  }

  private async captionsForCredentials(
    campaign: Campaign,
    credentials: Credential[],
  ): Promise<string[]> {
    const copy = this.campaignCopy(campaign);
    const captions = credentials.map(() => copy);
    const neededByPlatform = new Map<ContentIntelligencePlatform, number[]>();

    credentials.forEach((credential, index) => {
      const platform = fromPrismaCredentialPlatform(credential.platform);
      const generatorPlatform = this.toGeneratorPlatform(platform);
      if (!generatorPlatform) {
        return;
      }
      const indexes = neededByPlatform.get(generatorPlatform) ?? [];
      indexes.push(index);
      neededByPlatform.set(generatorPlatform, indexes);
    });

    for (const [platform, indexes] of neededByPlatform) {
      if (indexes.length === 0) {
        continue;
      }
      try {
        const generated = await this.contentGeneratorService.generateContent(
          campaign.organizationId,
          {
            additionalContext: [
              'Write a platform-native variant of this campaign brief.',
              'Keep the objective and offer identical. Change only phrasing and hook.',
            ],
            brandId: campaign.brandId,
            platform,
            topic: copy,
            variationsCount: Math.min(indexes.length, 10),
          },
        );
        generated.forEach((item, offset) => {
          const index = indexes[offset];
          if (index === undefined || !item.content.trim()) {
            return;
          }
          captions[index] = item.content;
        });
      } catch (error: unknown) {
        this.logger.warn('Campaign platform variation degraded to brief', {
          campaignId: campaign.id,
          error: getErrorMessage(error),
          platform,
        });
      }
    }

    return captions;
  }

  private campaignCopy(campaign: Campaign): string {
    return (
      campaign.brief?.trim() || campaign.objective?.trim() || campaign.name
    );
  }

  private toGeneratorPlatform(
    platform: string | undefined,
  ): ContentIntelligencePlatform | undefined {
    return Object.values(ContentIntelligencePlatform).find(
      (value) => value === platform,
    );
  }

  private async requireCampaign(
    organizationId: string,
    id: string,
  ): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }
    return campaign;
  }
}
