import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { getChannelCapability } from '@api-types/contracts/channel-capabilities.contract';
import {
  type EngagementCredentialEligibility,
  type EngagementMetricSnapshot,
  type EngagementRuleActionPayload,
  engagementRuleActionPayloadSchema,
  evaluateEngagementRule,
} from '@api-types/contracts/engagement-rules.contract';
import type { ChannelTargetInput } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
  parsePlatform,
  ReleaseAttachmentKind,
  ReleaseStatus,
} from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import type { IPublisher } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const REPOST_PLATFORMS = new Set<string>([
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.MASTODON,
  CredentialPlatform.THREADS,
  CredentialPlatform.TWITTER,
]);

const EMPTY_SNAPSHOT: EngagementMetricSnapshot = {
  comments: 0,
  engagementRate: 0,
  likes: 0,
  shares: 0,
  views: 0,
};

type StoredRule = {
  actionPayload: unknown;
  actionType: EngagementRuleAction;
  brandId: string | null;
  id: string;
  isEnabled: boolean;
  metric: Parameters<typeof evaluateEngagementRule>[0]['rule']['metric'];
  mode: EngagementRuleMode;
  organizationId: string;
  postGroupId: string;
  state: EngagementRuleState;
  targetId: string;
  threshold: number;
  userId: string;
  windowEndsAt: Date | null;
};

type PublisherWithComment = {
  postComment: (
    organizationId: string,
    brandId: string | null,
    externalId: string,
    message: string,
    credentialId: string,
  ) => Promise<unknown>;
};

@Injectable()
export class CronEngagementTriggersService {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
    private readonly publisherFactory: PublisherFactoryService,
  ) {}

  /**
   * Evaluates armed engagement rules. Fired every 15 minutes by the
   * system-sweeps BullMQ Job Scheduler. At-most-once: fired rules complete
   * or expire and never re-arm after an ineligible credential.
   */
  async processArmedRules(): Promise<void> {
    const rules = (await this.prisma.engagementRule.findMany({
      where: {
        isDeleted: false,
        isEnabled: true,
        state: EngagementRuleState.ARMED,
      },
    })) as StoredRule[];

    this.logger.log('CronEngagementTriggersService found rules', {
      total: rules.length,
    });

    for (const rule of rules) {
      try {
        await this.processRule(rule);
      } catch (error: unknown) {
        this.logger.error('Engagement trigger failed for rule', {
          error: error instanceof Error ? error.message : 'Unknown error',
          organizationId: rule.organizationId,
          ruleId: rule.id,
        });
      }
    }
  }

  private async processRule(rule: StoredRule): Promise<void> {
    const target = await this.prisma.post.findFirst({
      where: {
        groupId: rule.postGroupId,
        id: rule.targetId,
        isDeleted: false,
        organizationId: rule.organizationId,
      },
      select: {
        brandId: true,
        credentialId: true,
        description: true,
        externalId: true,
        id: true,
        label: true,
        platform: true,
      },
    });
    if (!target) {
      return;
    }

    const snapshot = await this.loadSnapshot(rule);
    const eligibility = await this.loadEligibility(
      rule.organizationId,
      target.credentialId,
      target.platform,
    );
    const verdict = evaluateEngagementRule({
      eligibility,
      now: new Date(),
      rule: {
        actionType: rule.actionType,
        isEnabled: rule.isEnabled,
        metric: rule.metric,
        state: rule.state,
        threshold: rule.threshold,
        windowEndsAt: rule.windowEndsAt,
      },
      snapshot,
    });

    if (verdict.kind === 'skip') {
      return;
    }
    if (verdict.kind === 'expire') {
      await this.prisma.engagementRule.update({
        data: { state: EngagementRuleState.EXPIRED },
        where: { id: rule.id },
      });
      return;
    }
    if (verdict.kind === 'ineligible') {
      await this.prisma.engagementRule.update({
        data: {
          lastError: verdict.reason,
          state: EngagementRuleState.COMPLETED,
        },
        where: { id: rule.id },
      });
      return;
    }

    await this.prisma.engagementRule.update({
      data: {
        metricSnapshot: toPrismaJson(verdict.snapshot),
        state: EngagementRuleState.TRIGGERED,
        triggeredAt: new Date(),
      },
      where: { id: rule.id },
    });

    try {
      const resultingReleaseId = await this.fireRule(rule, target);
      await this.prisma.engagementRule.update({
        data: {
          ...(resultingReleaseId ? { resultingReleaseId } : {}),
          state: EngagementRuleState.COMPLETED,
        },
        where: { id: rule.id },
      });
    } catch (error: unknown) {
      await this.prisma.engagementRule.update({
        data: {
          lastError:
            error instanceof Error ? error.message : 'Engagement action failed',
          state: EngagementRuleState.COMPLETED,
        },
        where: { id: rule.id },
      });
    }
  }

  private async fireRule(
    rule: StoredRule,
    target: {
      brandId: string;
      credentialId: string | null;
      description: string;
      externalId: string | null;
      id: string;
      label: string | null;
      platform: string | null;
    },
  ): Promise<string | null> {
    const payload = this.parsePayload(rule.actionPayload);
    if (rule.actionType === EngagementRuleAction.REPOST) {
      return this.fireRepost(rule, target, payload);
    }
    return this.fireFollowUpComment(rule, target, payload);
  }

  private async fireRepost(
    rule: StoredRule,
    target: {
      description: string;
      label: string | null;
    },
    payload: EngagementRuleActionPayload,
  ): Promise<string> {
    const targets = this.toChannelTargets(payload);
    if (targets.length === 0) {
      throw new Error('Repost action has no valid channels.');
    }
    const release = await this.postGroupsService.create(
      rule.organizationId,
      rule.userId,
      {
        baseContent: target.description,
        ...(rule.brandId ? { brandId: rule.brandId } : {}),
        status: ReleaseStatus.DRAFT,
        targets,
        timezone: 'UTC',
        title: target.label?.trim() || 'Engagement repost',
      },
      undefined,
      { source: 'engagement' },
    );
    if (rule.mode === EngagementRuleMode.AUTO) {
      await this.postGroupsService.publishNow(
        rule.organizationId,
        rule.userId,
        release.id,
      );
    }
    return release.id;
  }

  private async fireFollowUpComment(
    rule: StoredRule,
    target: {
      brandId: string;
      credentialId: string | null;
      externalId: string | null;
      platform: string | null;
    },
    payload: EngagementRuleActionPayload,
  ): Promise<string | null> {
    const commentTemplate = payload.commentTemplate?.trim();
    if (!commentTemplate) {
      throw new Error('Follow-up comment is missing a template.');
    }

    const publisher = target.platform
      ? this.publisherFactory.getPublisher(target.platform)
      : null;
    const postComment =
      rule.mode === EngagementRuleMode.AUTO
        ? this.readPostComment(publisher)
        : undefined;

    if (
      rule.mode === EngagementRuleMode.AUTO &&
      postComment &&
      target.externalId &&
      target.credentialId
    ) {
      await postComment(
        rule.organizationId,
        target.brandId,
        target.externalId,
        commentTemplate,
        target.credentialId,
      );
      return null;
    }

    const platform = target.platform
      ? parsePlatform(target.platform)
      : undefined;
    if (!platform || !target.credentialId) {
      throw new Error('Follow-up comment is missing a connected target.');
    }

    const release = await this.postGroupsService.create(
      rule.organizationId,
      rule.userId,
      {
        attachments: [
          {
            body: commentTemplate,
            kind: ReleaseAttachmentKind.COMMENT,
            order: 0,
            platform,
          },
        ],
        baseContent: commentTemplate,
        ...(rule.brandId ? { brandId: rule.brandId } : {}),
        status: ReleaseStatus.DRAFT,
        targets: [
          {
            credentialId: target.credentialId,
            platform,
          },
        ],
        timezone: 'UTC',
        title: 'Follow-up comment',
      },
      undefined,
      { source: 'engagement' },
    );
    return release.id;
  }

  private parsePayload(value: unknown): EngagementRuleActionPayload {
    const parsed = engagementRuleActionPayloadSchema.safeParse(value);
    return parsed.success ? parsed.data : { channels: [] };
  }

  private toChannelTargets(
    payload: EngagementRuleActionPayload,
  ): ChannelTargetInput[] {
    return payload.channels.flatMap((channel) => {
      const platform = parsePlatform(channel.platform);
      if (!platform) {
        return [];
      }
      return [
        {
          credentialId: channel.credentialId,
          platform,
        },
      ];
    });
  }

  private async loadSnapshot(
    rule: StoredRule,
  ): Promise<EngagementMetricSnapshot> {
    const analytics = await this.prisma.postAnalytics.findFirst({
      orderBy: { date: 'desc' },
      where: {
        organizationId: rule.organizationId,
        postId: rule.targetId,
      },
      select: {
        engagementRate: true,
        totalComments: true,
        totalLikes: true,
        totalShares: true,
        totalViews: true,
      },
    });
    if (!analytics) {
      return EMPTY_SNAPSHOT;
    }
    return {
      comments: analytics.totalComments,
      engagementRate: analytics.engagementRate,
      likes: analytics.totalLikes,
      shares: analytics.totalShares,
      views: analytics.totalViews,
    };
  }

  private async loadEligibility(
    organizationId: string,
    credentialId: string | null,
    platform: string | null,
  ): Promise<EngagementCredentialEligibility> {
    if (!credentialId) {
      return {
        canWriteComments: false,
        canWriteReposts: false,
        isConnected: false,
      };
    }

    const credential = await this.prisma.credential.findFirst({
      select: { isConnected: true, platform: true },
      where: {
        id: credentialId,
        isDeleted: false,
        organizationId,
      },
    });
    const capability = getChannelCapability(
      platform ?? credential?.platform ?? '',
    );
    const isCataloged = capability?.status === 'supported';
    const domainPlatform = parsePlatform(
      platform ?? credential?.platform ?? '',
    );

    return {
      canWriteComments: isCataloged,
      canWriteReposts: Boolean(
        isCataloged && domainPlatform && REPOST_PLATFORMS.has(domainPlatform),
      ),
      isConnected: credential?.isConnected === true,
    };
  }

  private readPostComment(
    publisher: IPublisher | null,
  ): PublisherWithComment['postComment'] | undefined {
    if (!publisher) {
      return undefined;
    }
    const candidate = (publisher as unknown as Partial<PublisherWithComment>)
      .postComment;
    if (typeof candidate !== 'function') {
      return undefined;
    }
    return candidate.bind(publisher);
  }
}
