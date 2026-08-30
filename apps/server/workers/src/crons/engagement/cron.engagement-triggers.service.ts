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
  PostVisibility,
  parsePlatform,
  ReleaseAttachmentKind,
  ReleaseStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { type IPublisher, scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { PublisherFactoryService } from '@server/services/integrations/publishers/publisher-factory.service';
import {
  buildEngagementRuleWorkflowDefinition,
  buildEngagementSweepWorkflowDefinition,
  ENGAGEMENT_SWEEP_ACTION_IDS,
} from '@workers/crons/engagement/engagement-sweep-workflow-definition';

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

const ENGAGEMENT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

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

type RuleRequest = {
  organizationId: string;
  ruleId: string;
  userId?: string;
};

type RuleEvaluation = {
  outcome: 'expire' | 'ineligible' | 'skip' | 'trigger';
  reason?: string;
  rule?: StoredRule;
  target?: {
    brandId: string;
    credentialId: string | null;
    description: string;
    externalId: string | null;
    id: string;
    label: string | null;
    platform: string | null;
  };
};

type RuleExecution = {
  releaseId: string | null;
  requiresPublish: boolean;
};

@Injectable()
export class CronEngagementTriggersService implements OnModuleInit {
  constructor(
    readonly _logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
    private readonly publisherFactory: PublisherFactoryService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.registerActions();
    this.systemWorkflowRunner.registerWorkflow(
      buildEngagementSweepWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildEngagementRuleWorkflowDefinition(),
    );
  }

  /**
   * Evaluates armed engagement rules. Fired every 15 minutes by the
   * system-sweeps BullMQ Job Scheduler. At-most-once: fired rules complete
   * or expire and never re-arm after an ineligible credential.
   */
  async processArmedRules(): Promise<void> {
    const definition = buildEngagementSweepWorkflowDefinition();
    const bucket = Math.floor(Date.now() / ENGAGEMENT_SWEEP_INTERVAL_MS);
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          request: { requestedAt: new Date().toISOString() },
        },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'engagement_rule_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `engagement-sweep-${bucket}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  private registerActions(): void {
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.DISCOVER,
      () => this.discoverRules(),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.EVALUATE,
      ({ input }) => this.evaluateRule(input.request as RuleRequest),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.EXPIRE,
      ({ input }) => this.expireRule(input.request as RuleRequest),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.MARK_INELIGIBLE,
      ({ input }) =>
        this.markIneligible(
          input.request as RuleRequest,
          this.unwrapBranch<RuleEvaluation>(input.evaluation),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.EXECUTE,
      ({ input }) =>
        this.executeRule(this.unwrapBranch<RuleEvaluation>(input.evaluation)),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.PUBLISH,
      ({ input }) =>
        this.publishRelease(
          input.request as RuleRequest,
          this.unwrapBranch<RuleExecution>(input.execution),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.FINALIZE_SUCCESS,
      ({ input }) =>
        this.finalizeSuccess(
          input.request as RuleRequest,
          this.unwrapBranch<RuleExecution>(input.execution),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      ENGAGEMENT_SWEEP_ACTION_IDS.FINALIZE_FAILURE,
      ({ input }) =>
        this.finalizeFailure(input.request as RuleRequest, input.failure),
    );
  }

  private async discoverRules(): Promise<{ items: RuleRequest[] }> {
    const rules = await this.prisma.engagementRule.findMany({
      select: { id: true, organizationId: true, userId: true },
      where: {
        isDeleted: false,
        isEnabled: true,
        state: EngagementRuleState.ARMED,
      },
    });
    return {
      items: rules.map((rule) => ({
        organizationId: rule.organizationId,
        ruleId: rule.id,
        userId: rule.userId,
      })),
    };
  }

  private async evaluateRule(request: RuleRequest): Promise<RuleEvaluation> {
    const rule = (await this.prisma.engagementRule.findFirst({
      where: scopedWhere(request.organizationId, {
        id: request.ruleId,
        isEnabled: true,
        state: EngagementRuleState.ARMED,
      }),
    })) as StoredRule | null;
    if (!rule) return { outcome: 'skip' };
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
    if (!target) return { outcome: 'skip' };

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

    if (verdict.kind === 'skip') return { outcome: 'skip', rule, target };
    if (verdict.kind === 'expire') return { outcome: 'expire', rule, target };
    if (verdict.kind === 'ineligible') {
      return { outcome: 'ineligible', reason: verdict.reason, rule, target };
    }
    await this.prisma.engagementRule.updateMany({
      data: {
        metricSnapshot: toPrismaJson(verdict.snapshot),
        state: EngagementRuleState.TRIGGERED,
        triggeredAt: new Date(),
      },
      where: scopedWhere(request.organizationId, {
        id: request.ruleId,
        state: EngagementRuleState.ARMED,
      }),
    });
    return { outcome: 'trigger', rule, target };
  }

  private async expireRule(
    request: RuleRequest,
  ): Promise<{ expired: boolean }> {
    const result = await this.prisma.engagementRule.updateMany({
      data: { state: EngagementRuleState.EXPIRED },
      where: scopedWhere(request.organizationId, { id: request.ruleId }),
    });
    return { expired: result.count > 0 };
  }

  private async markIneligible(
    request: RuleRequest,
    evaluation: RuleEvaluation,
  ): Promise<{ completed: boolean }> {
    const result = await this.prisma.engagementRule.updateMany({
      data: {
        lastError: evaluation.reason ?? 'Engagement rule is ineligible',
        state: EngagementRuleState.COMPLETED,
      },
      where: scopedWhere(request.organizationId, { id: request.ruleId }),
    });
    return { completed: result.count > 0 };
  }

  private async executeRule(
    evaluation: RuleEvaluation,
  ): Promise<RuleExecution> {
    if (!evaluation.rule || !evaluation.target) {
      throw new Error('Engagement rule execution is missing evaluated context');
    }
    const releaseId = await this.fireRule(evaluation.rule, evaluation.target);
    return {
      releaseId,
      requiresPublish:
        evaluation.rule.actionType === EngagementRuleAction.REPOST &&
        evaluation.rule.mode === EngagementRuleMode.AUTO,
    };
  }

  private async publishRelease(
    request: RuleRequest,
    execution: RuleExecution,
  ): Promise<RuleExecution> {
    if (!execution.releaseId || !request.userId) {
      throw new Error(
        'Engagement repost publication is missing release context',
      );
    }
    await this.postGroupsService.publishNow(
      request.organizationId,
      request.userId,
      execution.releaseId,
    );
    return execution;
  }

  private async finalizeSuccess(
    request: RuleRequest,
    execution: RuleExecution,
  ): Promise<{ completed: boolean; releaseId: string | null }> {
    const result = await this.prisma.engagementRule.updateMany({
      data: {
        ...(execution.releaseId
          ? { resultingReleaseId: execution.releaseId }
          : {}),
        state: EngagementRuleState.COMPLETED,
      },
      where: scopedWhere(request.organizationId, { id: request.ruleId }),
    });
    return { completed: result.count > 0, releaseId: execution.releaseId };
  }

  private async finalizeFailure(
    request: RuleRequest,
    failure: unknown,
  ): Promise<{ completed: boolean }> {
    const message = getErrorMessage(failure, {
      coerceMessage: true,
      fallback: () => 'Engagement action failed',
    });
    const result = await this.prisma.engagementRule.updateMany({
      data: { lastError: message, state: EngagementRuleState.COMPLETED },
      where: scopedWhere(request.organizationId, { id: request.ruleId }),
    });
    return { completed: result.count > 0 };
  }

  private unwrapBranch<T>(value: unknown): T {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: T }).data;
    }
    return value as T;
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
          visibility: PostVisibility.PUBLIC,
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
