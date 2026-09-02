import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.service';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/contracts';
import { toPrismaJson, type Workflow } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
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
type ReplyPollingAction =
  | typeof AUTOMATION_WORKFLOW_IDS.REPLY_BOTS
  | typeof AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGERS;

type WorkflowNode = {
  data?: { config?: Record<string, unknown>; label?: string };
  id: string;
  type: string;
};
type WorkflowWithNodes = Workflow & { nodes: WorkflowNode[] };

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
    private readonly prisma: PrismaService,
    private readonly executionQueue: WorkflowExecutionQueueService,
    private readonly twitterAdapter: TwitterSocialAdapter,
    private readonly youtubeAdapter: YoutubeSocialAdapter,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async beginReplyBotPolling(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const action = AUTOMATION_WORKFLOW_IDS.REPLY_BOTS;
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(lockKey, 600);
    return { acquired, lockKey, organizationId };
  }

  async discoverReplyBotTargets(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true)
      return { baseInput: { organizationId }, items: [] };
    const items = await this.findReplyBotTargets(organizationId);
    return { baseInput: { organizationId }, items };
  }

  prepareReplyBotTarget(
    organizationId: string,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const target = this.readRecord(input.item);
    const credentialId = this.requiredString(
      target.credentialId,
      'credentialId',
    );
    return { credentialId, organizationId };
  }

  finalizeReplyBotTarget(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const results = Array.isArray(input.results)
      ? (input.results as Array<Record<string, unknown>>)
      : [];
    return {
      errors: results.reduce(
        (total, result) =>
          total + (typeof result.errors === 'number' ? result.errors : 0),
        0,
      ),
      status: 'processed',
      triggered: results.reduce(
        (total, result) =>
          total +
          (typeof result.repliesSent === 'number' ? result.repliesSent : 0),
        0,
      ),
    };
  }

  async beginSocialTriggerPolling(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const enabled = this.configService.isDevSchedulersEnabled;
    const lockKey = this.lockKey(
      AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGERS,
      organizationId,
    );
    const acquired =
      enabled && (await this.cacheService.acquireLock(lockKey, 300));
    return { acquired, enabled, lockKey, organizationId };
  }

  async discoverSocialTriggerWorkflows(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true)
      return { baseInput: { organizationId }, items: [] };
    const workflows =
      await this.findWorkflowsWithSocialTriggers(organizationId);
    const items = workflows.flatMap((workflow) =>
      workflow.nodes
        .filter((node) =>
          SOCIAL_TRIGGER_TYPES.includes(node.type as SocialTriggerType),
        )
        .map((node) => ({ node, workflow })),
    );
    return { baseInput: { organizationId }, items };
  }

  async processSocialTriggerWorkflow(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const item = this.readRecord(input.item);
    const workflow = item.workflow as WorkflowWithNodes | undefined;
    const node = item.node as WorkflowNode | undefined;
    if (!workflow || !node) {
      throw new Error('Social trigger workflow and node are required');
    }
    const wfConfig = (workflow.config as WorkflowConfig) ?? {};
    const pollState: PollState = wfConfig.metadata?.pollState ?? {};
    const workflowOrganizationId = this.requiredString(
      workflow.organizationId,
      'workflow.organizationId',
    );
    const workflowUserId = this.requiredString(
      workflow.userId,
      'workflow.userId',
    );
    let triggered = false;
    let errors = 0;
    try {
      const previousEventId = pollState[node.id];
      const result = await this.checkTrigger(
        workflow,
        node,
        typeof previousEventId === 'string' ? previousEventId : null,
      );
      if (result) {
        const triggerEvent: TriggerEvent = {
          data: result.data,
          organizationId: workflowOrganizationId,
          platform: result.platform,
          type: node.type,
          userId: workflowUserId,
        };
        await this.executionQueue.queueTriggerEvent(triggerEvent);
        triggered = true;
        pollState[node.id] = result.lastEventId;
      }
    } catch (error) {
      this.logger.error(`${this.logContext} social polling failed`, {
        error,
        workflowId: workflow.id,
      });
      errors = 1;
    }
    pollState.lastPolledAt = new Date().toISOString();
    await this.prisma.workflow.update({
      data: {
        config: toPrismaJson({
          ...wfConfig,
          metadata: { ...(wfConfig.metadata ?? {}), pollState },
        }),
      },
      where: scopedWhere(workflowOrganizationId, { id: workflow.id }),
    });
    return {
      errors,
      status: errors === 0 ? 'processed' : 'failed',
      triggered: triggered ? 1 : 0,
    };
  }

  async finalizePolling(
    action: ReplyPollingAction,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<ReplyPollingWorkflowResult> {
    const state = this.readRecord(input.state);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    if (state.acquired === true)
      await this.cacheService.releaseLock(this.lockKey(action, organizationId));
    if (state.acquired !== true) {
      const reason =
        action === AUTOMATION_WORKFLOW_IDS.REPLY_BOTS
          ? 'reply_bot_polling_locked'
          : state.enabled === false
            ? 'local_schedulers_disabled'
            : 'social_polling_locked';
      return this.skipped(action, organizationId, reason);
    }
    return {
      action,
      checked: results.length,
      errors: results.reduce(
        (sum, result) =>
          sum + (typeof result.errors === 'number' ? result.errors : 0),
        0,
      ),
      organizationId,
      skipped: results.length === 0 ? 1 : 0,
      status: 'completed',
      triggered: results.reduce(
        (sum, result) =>
          sum + (typeof result.triggered === 'number' ? result.triggered : 0),
        0,
      ),
    };
  }

  async failPolling(
    action: ReplyPollingAction,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acquired = this.readRecord(input.state).acquired === true;
    if (acquired)
      await this.cacheService.releaseLock(this.lockKey(action, organizationId));
    return { organizationId, released: acquired };
  }

  private async findReplyBotTargets(
    organizationId: string,
  ): Promise<ReplyBotTarget[]> {
    const configs = await this.replyBotConfigsService.find(
      scopedWhere(organizationId, { isActive: true }),
    );

    const targets = configs.reduce((result, config) => {
      const credentialId = this.readCredentialId(config);
      if (!credentialId) return result;
      result.set(`${organizationId}:${credentialId}`, {
        credentialId,
        organizationId,
      });
      return result;
    }, new Map<string, ReplyBotTarget>());
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

  private async findWorkflowsWithSocialTriggers(
    organizationId: string,
  ): Promise<WorkflowWithNodes[]> {
    const workflows = await this.prisma.workflow.findMany({
      include: { currentVersion: { select: { graph: true } } },
      take: 200,
      where: scopedWhere(organizationId, {
        lifecycle: WorkflowLifecycle.PUBLISHED,
        status: WorkflowStatus.ACTIVE,
      }),
    });

    return workflows
      .map((workflow): WorkflowWithNodes => {
        const graph = workflow.currentVersion?.graph;
        const nodes =
          graph !== null && typeof graph === 'object' && !Array.isArray(graph)
            ? (graph as { nodes?: unknown }).nodes
            : [];
        return {
          ...workflow,
          nodes: Array.isArray(nodes) ? (nodes as WorkflowNode[]) : [],
        };
      })
      .filter((workflow) => {
        const nodes = workflow.nodes;
        return nodes.some((node) =>
          SOCIAL_TRIGGER_TYPES.includes(node.type as SocialTriggerType),
        );
      });
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
      platform === Platform.TWITTER
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
      platform === Platform.TWITTER
        ? this.twitterAdapter.createLikeChecker()
        : null;

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
      platform === Platform.TWITTER
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
      platform === Platform.TWITTER
        ? this.twitterAdapter.createRepostChecker()
        : null;

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
      platform === Platform.TWITTER
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
      platform === Platform.TWITTER
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

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${field} is required`);
    return value;
  }
}
