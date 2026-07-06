import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import {
  type ProcessingResult,
  ReplyBotOrchestratorService,
} from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyBotPlatform,
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import type { Workflow } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

const SOCIAL_TRIGGER_TYPES = [
  'mentionTrigger',
  'newLikeTrigger',
  'newFollowerTrigger',
  'newRepostTrigger',
  'commentTrigger',
  'keywordTrigger',
  'engagementTrigger',
] as const;

type SocialTriggerType = (typeof SOCIAL_TRIGGER_TYPES)[number];
type ReplyPollingAction = 'replyBotPolling' | 'socialTriggerPolling';

type WorkflowNode = {
  data?: { config?: Record<string, unknown>; label?: string };
  id: string;
  type: string;
};

type WorkflowConfig = {
  metadata?: {
    pollState?: PollState;
  };
  [key: string]: unknown;
};

interface PollState {
  [nodeId: string]: PollState | string | null | undefined;
  lastPolledAt?: string;
}

interface ReplyBotTarget {
  credentialId: string;
  organizationId: string;
}

export interface ReplyPollingWorkflowResult {
  action: ReplyPollingAction;
  checked: number;
  errors: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'completed' | 'skipped';
  triggered: number;
}

@Injectable()
export class ReplyPollingWorkflowService {
  private readonly logContext = 'ReplyPollingWorkflowService';

  constructor(
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly credentialsService: CredentialsService,
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly executionQueue: WorkflowExecutionQueueService,
    private readonly twitterAdapter: TwitterSocialAdapter,
    private readonly instagramAdapter: InstagramSocialAdapter,
    private readonly youtubeAdapter: YoutubeSocialAdapter,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async runReplyBotPolling(
    organizationId: string,
  ): Promise<ReplyPollingWorkflowResult> {
    const action: ReplyPollingAction = 'replyBotPolling';
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(lockKey, 600);

    if (!acquired) {
      return this.skipped(action, organizationId, 'reply_bot_polling_locked');
    }

    let checked = 0;
    let triggered = 0;
    let errors = 0;
    let skipped = 0;

    try {
      const targets = await this.findReplyBotTargets(organizationId);
      skipped = targets.length === 0 ? 1 : 0;

      for (const target of targets) {
        checked += 1;
        try {
          const credential = await this.loadCredential(target);
          if (!credential) {
            skipped += 1;
            continue;
          }

          const results =
            await this.replyBotOrchestratorService.processOrganizationBots(
              organizationId,
              credential,
            );

          triggered += results.length;
          errors += this.countReplyBotErrors(results);
        } catch (error: unknown) {
          errors += 1;
          this.logger.error(`${this.logContext} reply bot polling failed`, {
            credentialId: target.credentialId,
            error: this.errorMessage(error),
            organizationId,
          });
        }
      }

      return {
        action,
        checked,
        errors,
        organizationId,
        skipped,
        status: 'completed',
        triggered,
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  async runSocialTriggerPolling(
    organizationId: string,
  ): Promise<ReplyPollingWorkflowResult> {
    const action: ReplyPollingAction = 'socialTriggerPolling';

    if (!this.configService.isDevSchedulersEnabled) {
      return this.skipped(action, organizationId, 'local_schedulers_disabled');
    }

    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(lockKey, 300);

    if (!acquired) {
      return this.skipped(action, organizationId, 'social_polling_locked');
    }

    let checked = 0;
    let triggered = 0;
    let errors = 0;

    try {
      const workflows =
        await this.findWorkflowsWithSocialTriggers(organizationId);

      for (const workflow of workflows) {
        checked += 1;
        try {
          const didTrigger = await this.pollWorkflow(workflow);
          if (didTrigger) {
            triggered += 1;
          }
        } catch (error: unknown) {
          errors += 1;
          this.logger.error(`${this.logContext} social polling failed`, {
            error: this.errorMessage(error),
            organizationId,
            workflowId: workflow.id,
          });
        }
      }

      return {
        action,
        checked,
        errors,
        organizationId,
        skipped: workflows.length === 0 ? 1 : 0,
        status: 'completed',
        triggered,
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  private async findReplyBotTargets(
    organizationId: string,
  ): Promise<ReplyBotTarget[]> {
    const configs = await this.replyBotConfigsService.find({
      isActive: true,
      isDeleted: false,
      organizationId,
    });

    const targets = new Map<string, ReplyBotTarget>();

    for (const config of configs) {
      const credentialId = this.readCredentialId(config);
      if (!credentialId) {
        continue;
      }
      const key = `${organizationId}:${credentialId}`;
      if (!targets.has(key)) {
        targets.set(key, { credentialId, organizationId });
      }
    }

    return [...targets.values()];
  }

  private readCredentialId(config: ReplyBotConfigDocument): string | undefined {
    const configRecord = this.readRecord(config.config);
    return (
      this.optionalString(config.credential) ??
      this.optionalString(config.credentialId) ??
      this.optionalString(configRecord.credential) ??
      this.optionalString(configRecord.credentialId)
    );
  }

  private async loadCredential(
    target: ReplyBotTarget,
  ): Promise<IReplyBotCredentialData | null> {
    const credential = (await this.credentialsService.findOne({
      _id: target.credentialId,
      isDeleted: false,
      organization: target.organizationId,
    })) as CredentialDocument | null;

    if (!credential) {
      this.logger.warn(`${this.logContext} credential not found`, {
        credentialId: target.credentialId,
        organizationId: target.organizationId,
      });
      return null;
    }

    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken ?? ''),
      accessTokenSecret: credential.accessTokenSecret
        ? EncryptionUtil.decrypt(credential.accessTokenSecret)
        : undefined,
      externalId: credential.externalId ?? undefined,
      platform: credential.platform as ReplyBotPlatform,
      refreshToken: credential.refreshToken
        ? EncryptionUtil.decrypt(credential.refreshToken)
        : undefined,
      username: credential.username ?? undefined,
    };
  }

  private countReplyBotErrors(results: ProcessingResult[]): number {
    return results.reduce((sum, result) => sum + result.errors, 0);
  }

  private async findWorkflowsWithSocialTriggers(
    organizationId: string,
  ): Promise<Workflow[]> {
    const workflows = await this.prisma.workflow.findMany({
      take: 200,
      where: {
        isDeleted: false,
        lifecycle: WorkflowLifecycle.PUBLISHED as never,
        organizationId,
        status: WorkflowStatus.ACTIVE as never,
      },
    });

    return workflows.filter((workflow) => {
      const nodes = (workflow.nodes as WorkflowNode[]) ?? [];
      return nodes.some((node) =>
        SOCIAL_TRIGGER_TYPES.includes(node.type as SocialTriggerType),
      );
    });
  }

  private async pollWorkflow(workflow: Workflow): Promise<boolean> {
    const wfConfig = (workflow.config as WorkflowConfig) ?? {};
    const pollState: PollState = wfConfig.metadata?.pollState ?? {};
    let triggered = false;

    const nodes = (workflow.nodes as WorkflowNode[]) ?? [];
    const triggerNodes = nodes.filter((node) =>
      SOCIAL_TRIGGER_TYPES.includes(node.type as SocialTriggerType),
    );

    for (const node of triggerNodes) {
      try {
        if (!workflow.organizationId || !workflow.userId) {
          this.logger.warn(`${this.logContext} workflow missing ownership`, {
            workflowId: workflow.id,
          });
          continue;
        }

        const previousEventId = pollState[node.id];
        const lastEventId =
          typeof previousEventId === 'string' ? previousEventId : null;
        const result = await this.checkTrigger(workflow, node, lastEventId);

        if (result) {
          const triggerEvent: TriggerEvent = {
            data: result.data,
            organizationId: workflow.organizationId,
            platform: result.platform,
            type: node.type,
            userId: workflow.userId,
          };

          await this.executionQueue.queueTriggerEvent(triggerEvent);
          triggered = true;
          pollState[node.id] = result.lastEventId;
        }
      } catch (error: unknown) {
        this.logger.error(`${this.logContext} trigger check failed`, {
          error: this.errorMessage(error),
          nodeId: node.id,
          nodeType: node.type,
          workflowId: workflow.id,
        });
      }
    }

    pollState.lastPolledAt = new Date().toISOString();
    const updatedConfig: WorkflowConfig = {
      ...wfConfig,
      metadata: {
        ...(wfConfig.metadata ?? {}),
        pollState,
      },
    };

    await this.prisma.workflow.update({
      data: { config: updatedConfig as never },
      where: { id: workflow.id },
    });

    return triggered;
  }

  private checkTrigger(
    workflow: Workflow,
    node: WorkflowNode,
    lastEventId: string | null,
  ): Promise<{
    data: Record<string, unknown>;
    lastEventId: string;
    platform: string;
  } | null> {
    const config = node.data?.config || {};
    const orgId = workflow.organizationId;
    const platform = (config.platform as string) || 'twitter';

    switch (node.type as SocialTriggerType) {
      case 'mentionTrigger':
        return this.checkMentionTrigger(orgId, platform, config, lastEventId);
      case 'newLikeTrigger':
        return this.checkLikeTrigger(orgId, platform, config, lastEventId);
      case 'newFollowerTrigger':
        return this.checkFollowerTrigger(orgId, platform, config, lastEventId);
      case 'newRepostTrigger':
        return this.checkRepostTrigger(orgId, platform, config, lastEventId);
      case 'commentTrigger':
        return this.checkCommentTrigger(
          workflow,
          platform,
          config,
          lastEventId,
        );
      case 'keywordTrigger':
        return this.checkKeywordTrigger(orgId, platform, config, lastEventId);
      case 'engagementTrigger':
        return this.checkEngagementTrigger(
          orgId,
          platform,
          config,
          lastEventId,
        );
      default:
        return Promise.resolve(null);
    }
  }

  private async checkMentionTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ): Promise<{
    data: Record<string, unknown>;
    lastEventId: string;
    platform: string;
  } | null> {
    const checker =
      platform === 'twitter'
        ? this.twitterAdapter.createMentionChecker()
        : null;

    if (!checker) {
      return null;
    }

    const result = await checker({
      excludeKeywords: (config.excludeKeywords as string[]) || [],
      keywords: (config.keywords as string[]) || [],
      lastMentionId: lastEventId,
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram' | 'threads',
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.postId,
      platform,
    };
  }

  private async checkLikeTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    const checker =
      platform === 'twitter' ? this.twitterAdapter.createLikeChecker() : null;

    if (!checker) {
      return null;
    }

    const result = await checker({
      lastLikeId: lastEventId,
      minLikerFollowerCount:
        (config.minLikerFollowerCount as number) || undefined,
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram',
      postIds: (config.postIds as string[]) || [],
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.likerId,
      platform,
    };
  }

  private async checkFollowerTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    const checker =
      platform === 'twitter'
        ? this.twitterAdapter.createFollowerChecker()
        : null;

    if (!checker) {
      return null;
    }

    const result = await checker({
      lastFollowerId: lastEventId,
      minFollowerCount: (config.minFollowerCount as number) || undefined,
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram',
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.followerId,
      platform,
    };
  }

  private async checkRepostTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    const checker =
      platform === 'twitter' ? this.twitterAdapter.createRepostChecker() : null;

    if (!checker) {
      return null;
    }

    const result = await checker({
      lastRepostId: lastEventId,
      minReposterFollowerCount:
        (config.minReposterFollowerCount as number) || undefined,
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram',
      postIds: (config.postIds as string[]) || [],
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.reposterId,
      platform,
    };
  }

  private async checkKeywordTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    const checker =
      platform === 'twitter'
        ? this.twitterAdapter.createKeywordChecker()
        : null;

    if (!checker) {
      return null;
    }

    const result = await checker({
      caseSensitive: (config.caseSensitive as boolean) || false,
      excludeKeywords: (config.excludeKeywords as string[]) || [],
      keywords: (config.keywords as string[]) || [],
      lastPostId: lastEventId,
      matchMode:
        (config.matchMode as 'contains' | 'exact' | 'regex') || 'contains',
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram',
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.postId,
      platform,
    };
  }

  private async checkCommentTrigger(
    workflow: Workflow,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    if (platform !== 'youtube') {
      return null;
    }

    const brandId =
      this.optionalString(config.brandId) ??
      this.optionalString(workflow.defaultRecurringBrandId);

    if (!brandId) {
      this.logger.warn(`${this.logContext} comment trigger missing brand`, {
        platform,
        workflowId: workflow.id,
      });
      return null;
    }

    const checker = this.youtubeAdapter.createCommentChecker();
    const contentIds = this.readStringArray(
      config.contentIds ?? config.videoIds ?? config.postIds,
    );

    const result = await checker({
      brandId,
      contentIds,
      excludeKeywords: this.readStringArray(config.excludeKeywords),
      keywords: this.readStringArray(config.keywords),
      lastCommentId: lastEventId,
      organizationId: workflow.organizationId,
      platform: 'youtube',
    });

    if (!result) {
      return null;
    }

    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.commentId,
      platform,
    };
  }

  private async checkEngagementTrigger(
    orgId: string,
    platform: string,
    config: Record<string, unknown>,
    lastEventId: string | null,
  ) {
    const checker =
      platform === 'twitter'
        ? this.twitterAdapter.createEngagementChecker()
        : null;

    if (!checker) {
      return null;
    }

    const rawMetricType = (config.metricType as string) || 'likes';
    const mappedMetricType =
      rawMetricType === 'reposts'
        ? 'shares'
        : rawMetricType === 'replies'
          ? 'comments'
          : rawMetricType === 'engagement_rate'
            ? 'likes'
            : rawMetricType;
    const metricType: 'comments' | 'likes' | 'shares' | 'views' =
      mappedMetricType === 'likes' ||
      mappedMetricType === 'comments' ||
      mappedMetricType === 'shares' ||
      mappedMetricType === 'views'
        ? mappedMetricType
        : 'likes';

    const result = await checker({
      lastCheckedPostId: lastEventId,
      metricType,
      organizationId: orgId,
      platform: platform as 'twitter' | 'instagram',
      postIds: (config.postIds as string[]) || [],
      threshold: (config.threshold as number) || 100,
    });

    if (!result) {
      return null;
    }
    return {
      data: result as unknown as Record<string, unknown>,
      lastEventId: result.postId,
      platform,
    };
  }

  private lockKey(action: ReplyPollingAction, organizationId: string): string {
    return ['workflow-reply-polling', action, organizationId].join(':');
  }

  private skipped(
    action: ReplyPollingAction,
    organizationId: string,
    reason: string,
  ): ReplyPollingWorkflowResult {
    return {
      action,
      checked: 0,
      errors: 0,
      organizationId,
      reason,
      skipped: 1,
      status: 'skipped',
      triggered: 0,
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
      : [];
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
