import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { PublishApprovalsService, type PublishResult } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import type { PostEntity } from '@server/collections/posts/entities/post.entity';
import {
  buildScheduledPostFailureWorkflowDefinition,
  buildScheduledPostWorkflowDefinition,
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';

type ScheduledPostClaim = {
  executionStartedAt: string | null;
  isAlreadyPublished: boolean;
  publishedResult: PublishResult;
};

@Injectable()
export class ScheduledPostWorkflowService implements OnModuleInit {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly deliveryService: ScheduledPostDeliveryService,
    private readonly discoveryService: ScheduledPostDiscoveryService,
    private readonly executionGuard: ScheduledPostExecutionGuardService,
    private readonly logger: LoggerService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly repeatScheduler: PostRepeatSchedulerService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(SCHEDULED_POST_ACTION_IDS.CLAIM, (request) =>
      this.claim(request),
    );
    this.runner.registerAction(SCHEDULED_POST_ACTION_IDS.FAIL, (request) =>
      this.fail(request),
    );
    this.runner.registerAction(SCHEDULED_POST_ACTION_IDS.FINALIZE, (request) =>
      this.finalize(request),
    );
    this.runner.registerWorkflow(buildScheduledPostWorkflowDefinition());
    this.runner.registerWorkflow(buildScheduledPostFailureWorkflowDefinition());
  }

  private async claim(
    action: SystemWorkflowActionRequest,
  ): Promise<ScheduledPostClaim> {
    const request = this.readRequest(action.input);
    const post = await this.requireEligiblePost(request);
    const { approvalId, operationId, versionPinId } =
      this.requireApprovalIdentity(request);
    let executionStartedAt: string | null = null;

    try {
      await this.executionGuard.assertAgentPublishingScope(post);
      const approvalStatus = this.readApprovalStatus(post);
      if (
        approvalStatus !== PublishApprovalStatus.QUEUED &&
        approvalStatus !== PublishApprovalStatus.EXECUTING &&
        approvalStatus !== PublishApprovalStatus.PUBLISHED
      ) {
        await this.publishApprovalsService.markQueued(
          approvalId,
          request.organizationId,
          request.userId,
        );
      }
      const claim = await this.publishApprovalsService.claimForExecution({
        approvalId,
        operationId,
        organizationId: request.organizationId,
        postId: request.postId,
        versionPinId,
      });
      executionStartedAt = claim.executionStartedAt;
      if (!claim.isAlreadyPublished) {
        if (!executionStartedAt) {
          throw new Error('Publish execution claim did not return a lease.');
        }
        await this.executionGuard.assertPublishVersionPin(post, versionPinId);
      }
      return {
        executionStartedAt,
        isAlreadyPublished: claim.isAlreadyPublished,
        publishedResult: this.toPublishedResult(post),
      };
    } catch (error: unknown) {
      if (executionStartedAt) {
        await this.releaseRejectedClaim(request, executionStartedAt, error);
      }
      throw error;
    }
  }

  private async finalize(
    action: SystemWorkflowActionRequest,
  ): Promise<PublishResult> {
    const request = this.readRequest(action.input);
    const claim = this.readClaim(action.input.claim);
    const result = this.readPublishResult(action.input.delivery);
    const post = await this.requirePost(request);

    if (claim.isAlreadyPublished) {
      await this.repeatScheduler.materializeRecurrence(post);
      return result;
    }
    if (!claim.executionStartedAt) {
      throw new Error('Scheduled publish finalization requires a claim lease.');
    }
    await this.publishApprovalsService.completeExecution({
      approvalId: this.requiredString(request.approvalId, 'approvalId'),
      ...(result.error ? { error: result.error } : {}),
      executionStartedAt: claim.executionStartedAt,
      isSuccessful: result.success,
      operationId: this.requiredString(request.operationId, 'operationId'),
      organizationId: request.organizationId,
      versionPinId: this.requiredString(request.versionPinId, 'versionPinId'),
    });

    if (result.success && !result.isProviderDraft) {
      await this.activitiesService.create(
        new ActivityEntity({
          brandId: readPostString(post, ['brandId']) ?? undefined,
          entityId: post.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_PUBLISHED,
          organizationId: readPostString(post, ['organizationId']) ?? undefined,
          source: ActivitySource.POST,
          userId: readPostString(post, ['userId']) ?? undefined,
          value: `Published to ${result.platform}: ${result.url}`,
        }),
      );
      await this.repeatScheduler.scheduleNextRepeat(
        post,
        'ScheduledPostWorkflowService.finalize',
      );
    }
    return result;
  }

  private async fail(
    action: SystemWorkflowActionRequest,
  ): Promise<PublishResult | { reason: 'not_eligible'; skipped: true }> {
    const request = this.readRequest(action.input);
    const post = await this.discoveryService.findEligiblePost(request);
    if (!post) {
      return { reason: 'not_eligible', skipped: true };
    }
    const workflowError =
      typeof action.input.workflowError === 'string'
        ? action.input.workflowError
        : 'Scheduled publish workflow failed before finalization.';
    return this.deliveryService.failTerminalValidation(
      post,
      new Error(workflowError),
    );
  }

  private async releaseRejectedClaim(
    request: ScheduledPostWorkflowInput,
    executionStartedAt: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.publishApprovalsService.completeExecution({
        approvalId: this.requiredString(request.approvalId, 'approvalId'),
        error: getErrorMessage(error, {
          fallback: () => 'Publish claim failed',
          messageSource: 'error-instance',
        }),
        executionStartedAt,
        isSuccessful: false,
        operationId: this.requiredString(request.operationId, 'operationId'),
        organizationId: request.organizationId,
        versionPinId: this.requiredString(request.versionPinId, 'versionPinId'),
      });
    } catch (completionError: unknown) {
      this.logger.error('Failed to release rejected publish claim', {
        approvalId: request.approvalId,
        error: getErrorMessage(completionError, {
          fallback: () => 'Unknown publish completion error',
          messageSource: 'error-instance',
        }),
        postId: request.postId,
      });
    }
  }

  private async requireEligiblePost(
    request: ScheduledPostWorkflowInput,
  ): Promise<PostEntity> {
    const post = await this.discoveryService.findEligiblePost(request);
    if (!post) {
      throw new Error(`Scheduled post ${request.postId} is not eligible`);
    }
    return post;
  }

  private async requirePost(
    request: ScheduledPostWorkflowInput,
  ): Promise<PostEntity> {
    const post = await this.discoveryService.findPost(request);
    if (!post) {
      throw new Error(`Scheduled post ${request.postId} was not found`);
    }
    return post;
  }

  private readRequest(
    input: Record<string, unknown>,
  ): ScheduledPostWorkflowInput {
    const source = this.readRecord(input.request);
    const record = Object.keys(source).length > 0 ? source : input;
    const rawSource = this.requiredString(record.source, 'source');
    if (
      ![
        'manual_retry',
        'publish_now',
        'scheduled_sweep',
        'tiktok_app',
      ].includes(rawSource)
    ) {
      throw new Error(`Scheduled publish received invalid source ${rawSource}`);
    }
    return {
      ...(typeof record.approvalId === 'string'
        ? { approvalId: record.approvalId }
        : {}),
      ...(typeof record.operationId === 'string'
        ? { operationId: record.operationId }
        : {}),
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      postId: this.requiredString(record.postId, 'postId'),
      source: rawSource as ScheduledPostWorkflowInput['source'],
      ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
      ...(typeof record.versionPinId === 'string'
        ? { versionPinId: record.versionPinId }
        : {}),
    };
  }

  private readClaim(value: unknown): ScheduledPostClaim {
    const claim = this.readRecord(value);
    return {
      executionStartedAt:
        typeof claim.executionStartedAt === 'string'
          ? claim.executionStartedAt
          : null,
      isAlreadyPublished: claim.isAlreadyPublished === true,
      publishedResult: this.readPublishResult(claim.publishedResult),
    };
  }

  private readPublishResult(value: unknown): PublishResult {
    const result = this.readRecord(value);
    const executionState = Object.values(TargetExecutionState).includes(
      result.executionState as TargetExecutionState,
    )
      ? (result.executionState as TargetExecutionState)
      : TargetExecutionState.FAILED;

    return {
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
      executionState,
      externalId:
        typeof result.externalId === 'string' ? result.externalId : null,
      ...(result.isProviderDraft === true ? { isProviderDraft: true } : {}),
      platform: typeof result.platform === 'string' ? result.platform : '',
      success: result.success === true,
      url: typeof result.url === 'string' ? result.url : '',
    };
  }

  private readApprovalStatus(post: PostEntity): string {
    return String(post.publishApproval?.status ?? '');
  }

  private toPublishedResult(post: PostEntity): PublishResult {
    return {
      executionState: TargetExecutionState.PUBLISHED,
      externalId: readPostString(post, ['externalId']) ?? null,
      platform: post.platform ?? '',
      success: true,
      url: readPostString(post, ['url']) ?? '',
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  // #3839 fail-closed contract: a publish job without all three identity fields
  // can never be reconciled against an approved version, so it is refused with
  // the documented wording rather than a generic missing-field error.
  private requireApprovalIdentity(request: ScheduledPostWorkflowInput): {
    approvalId: string;
    operationId: string;
    versionPinId: string;
  } {
    const { approvalId, operationId, versionPinId } = request;
    if (
      !this.isNonEmptyString(approvalId) ||
      !this.isNonEmptyString(operationId) ||
      !this.isNonEmptyString(versionPinId)
    ) {
      throw new Error(
        'Publish execution requires an explicit version-bound approval identity.',
      );
    }
    return { approvalId, operationId, versionPinId };
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private requiredString(value: unknown, field: string): string {
    if (!this.isNonEmptyString(value)) {
      throw new Error(`Scheduled publish requires ${field}`);
    }
    return value;
  }
}
