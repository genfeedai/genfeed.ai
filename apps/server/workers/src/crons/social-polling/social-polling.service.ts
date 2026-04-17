import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.service';
import { ConfigService } from '@api/config/config.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Workflow } from '@prisma/client';

/**
 * Social trigger node types that require polling.
 */
const SOCIAL_TRIGGER_TYPES = [
  'mentionTrigger',
  'newLikeTrigger',
  'newFollowerTrigger',
  'newRepostTrigger',
  'keywordTrigger',
  'engagementTrigger',
] as const;

type SocialTriggerType = (typeof SOCIAL_TRIGGER_TYPES)[number];

type WorkflowNode = {
  id: string;
  type: string;
  data: { config: Record<string, unknown> };
};

type WorkflowConfig = {
  metadata?: {
    pollState?: PollState;
  };
  [key: string]: unknown;
};

/**
 * Poll state stored per-workflow for tracking last seen event IDs.
 * Stored in workflow.config.metadata.pollState.
 */
interface PollState {
  /** Last seen event ID per trigger node */
  [nodeId: string]: string | null;
  /** Timestamp of last successful poll */
  lastPolledAt?: string;
}

/**
 * Social Polling Service
 *
 * Periodically checks social platform APIs for new events (mentions, likes,
 * reposts, followers, keywords, engagement) and triggers workflow executions.
 */
@Injectable()
export class SocialPollingService {
  private readonly logContext = 'SocialPollingService';
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionQueue: WorkflowExecutionQueueService,
    private readonly twitterAdapter: TwitterSocialAdapter,
    private readonly instagramAdapter: InstagramSocialAdapter,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Main polling loop — runs every 5 minutes in production.
   * Disabled in development to avoid hitting API rate limits.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollSocialTriggers(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.debug(
        `${this.logContext} skipping — local schedulers disabled`,
      );
      return;
    }

    if (this.isRunning) {
      this.logger.warn(
        `${this.logContext} skipping — previous poll in progress`,
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log(`${this.logContext} starting poll cycle`);

      // Find active workflows that have social trigger nodes
      const workflows = await this.findWorkflowsWithSocialTriggers();
      this.logger.log(
        `${this.logContext} found ${workflows.length} workflows with social triggers`,
      );

      let triggeredCount = 0;

      for (const workflow of workflows) {
        try {
          const triggered = await this.pollWorkflow(workflow);
          if (triggered) {
            triggeredCount++;
          }
        } catch (error) {
          this.logger.error(
            `${this.logContext} failed to poll workflow ${workflow.id}`,
            { error },
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `${this.logContext} poll cycle complete: ${workflows.length} checked, ${triggeredCount} triggered (${duration}ms)`,
      );
    } catch (error) {
      this.logger.error(`${this.logContext} poll cycle failed`, { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Find all active workflows that contain social trigger nodes.
   */
  private async findWorkflowsWithSocialTriggers(): Promise<Workflow[]> {
    const all = await this.prisma.workflow.findMany({
      take: 200,
      where: {
        isDeleted: false,
        status: WorkflowStatus.ACTIVE as never,
      },
    });

    // Filter in-memory for social trigger nodes
    return all.filter((w) => {
      const nodes = (w.nodes as WorkflowNode[]) ?? [];
      return nodes.some((n) =>
        SOCIAL_TRIGGER_TYPES.includes(n.type as SocialTriggerType),
      );
    });
  }

  /**
   * Poll a single workflow's social triggers for new events.
   * Returns true if any trigger fired.
   */
  private async pollWorkflow(workflow: Workflow): Promise<boolean> {
    const wfConfig = (workflow.config as WorkflowConfig) ?? {};
    const pollState: PollState = wfConfig.metadata?.pollState ?? {};
    let triggered = false;

    const nodes = (workflow.nodes as WorkflowNode[]) ?? [];
    const triggerNodes = nodes.filter((n) =>
      SOCIAL_TRIGGER_TYPES.includes(n.type as SocialTriggerType),
    );

    for (const node of triggerNodes) {
      try {
        if (!workflow.organizationId || !workflow.userId) {
          this.logger.warn(
            `${this.logContext} skipping workflow with missing organization/user`,
            { workflowId: workflow.id },
          );
          continue;
        }

        const result = await this.checkTrigger(
          workflow,
          node,
          pollState[node.id] || null,
        );

        if (result) {
          // Queue workflow execution
          const triggerEvent: TriggerEvent = {
            data: result.data,
            organizationId: workflow.organizationId,
            platform: result.platform,
            type: node.type,
            userId: workflow.userId,
          };

          await this.executionQueue.queueTriggerEvent(triggerEvent);
          triggered = true;

          // Update poll state with latest event ID
          pollState[node.id] = result.lastEventId;

          this.logger.log(
            `${this.logContext} triggered ${node.type} for workflow ${workflow.id}`,
            { eventId: result.lastEventId, platform: result.platform },
          );
        }
      } catch (error) {
        this.logger.error(
          `${this.logContext} trigger check failed for node ${node.id} in workflow ${workflow.id}`,
          { error, nodeType: node.type },
        );
      }
    }

    // Persist updated poll state
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

  /**
   * Check a single trigger node for new events.
   * Returns event data if a new event was found, null otherwise.
   */
  private checkTrigger(
    workflow: Workflow,
    node: WorkflowNode,
    lastEventId: string | null,
  ): Promise<{
    data: Record<string, unknown>;
    platform: string;
    lastEventId: string;
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
  ) {
    const checker =
      platform === 'twitter'
        ? this.twitterAdapter.createMentionChecker()
        : platform === 'instagram'
          ? this.instagramAdapter.createMentionChecker()
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
      platform === 'twitter'
        ? this.twitterAdapter.createLikeChecker()
        : platform === 'instagram'
          ? this.instagramAdapter.createLikeChecker()
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
      platform === 'twitter'
        ? this.twitterAdapter.createFollowerChecker()
        : platform === 'instagram'
          ? this.instagramAdapter.createFollowerChecker()
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
      platform === 'twitter'
        ? this.twitterAdapter.createRepostChecker()
        : platform === 'instagram'
          ? this.instagramAdapter.createRepostChecker()
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
        (config.matchMode as 'exact' | 'contains' | 'regex') || 'contains',
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
    const metricType: 'likes' | 'comments' | 'shares' | 'views' =
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
}
