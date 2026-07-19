import type {
  ManualRetryResolution,
  ResolveManualRetryParams,
  SchedulerPostGroup,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { validateChannelTargetSettings } from '@api-types/contracts/channel-capabilities.contract';
import type { ChannelTargetInput } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  PostStatus,
  PublishApprovalStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { PostPublishQueueService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

const GROUP_ACTION_STATES = new Set<string>([
  TargetExecutionState.DRAFT,
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.FAILED,
]);

@Injectable()
export class PostGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postPublishQueueService: PostPublishQueueService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly persistenceService: PostGroupPersistenceService,
    private readonly contractService: PostGroupContractService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    body: unknown,
    headerIdempotencyKey?: string,
    provenance?: PostGroupCreateProvenance,
  ): Promise<IReleaseGroup> {
    const input = this.contractService.parseCreateInput(
      body,
      headerIdempotencyKey,
    );

    if (input.idempotencyKey) {
      const existing = await this.persistenceService.findByIdempotencyKey(
        organizationId,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.status === ReleaseStatus.SCHEDULED) {
          await this.approveReleaseTargets(existing, userId, 'scheduled');
        }
        return existing;
      }
    }

    const status = this.contractService.resolveCreateStatus(input);
    const scheduledAt = this.contractService.toDate(input.scheduledDate);
    const release = await this.prisma.$transaction((tx) =>
      this.persistenceService.createPostGroup(tx, {
        input,
        organizationId,
        provenance,
        scheduledAt,
        status,
        userId,
      }),
    );

    this.logger.debug('Created scheduler post group', {
      groupId: release.id,
      organizationId,
      targetCount: release.targets?.length ?? 0,
    });

    if (release.status === ReleaseStatus.SCHEDULED) {
      await this.approveReleaseTargets(release, userId, 'scheduled');
    }
    return release;
  }

  async getOne(
    organizationId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const group = await this.persistenceService.getGroupOrThrow(
      this.prisma,
      organizationId,
      groupId,
    );
    const targets = await this.persistenceService.getTargets(
      this.prisma,
      organizationId,
      group.id,
    );
    return this.contractService.toReleaseGroup(group, targets);
  }

  async scheduleTarget(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    scheduledAt: string,
    provenance?: PostGroupCreateProvenance,
  ): Promise<IReleaseGroup> {
    const scheduledDate =
      this.contractService.parseFutureScheduleDate(scheduledAt);

    return this.prisma.$transaction(async (tx) => {
      const group = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const target = await this.persistenceService.getTargetOrThrow(
        tx,
        organizationId,
        group.id,
        targetId,
      );

      this.contractService.assertSchedulableTarget(group, target);

      const platform = this.contractService.parseCredentialPlatform(
        target.platform,
      );
      const targetInput: ChannelTargetInput = {
        credentialId: target.credentialId,
        platform,
        scheduledDate: scheduledDate.toISOString(),
        settings: this.contractService.asRecord(target.targetSettings),
        timezone: target.timezone,
      };
      const credentials = await this.persistenceService.resolveCredentials(
        tx,
        organizationId,
        [targetInput],
      );
      await this.persistenceService.resolveBrandId(
        tx,
        organizationId,
        group.brandId,
        credentials,
      );

      const validation = validateChannelTargetSettings({
        caption: group.baseContent,
        credentialId: targetInput.credentialId,
        media: this.contractService.toValidationMedia(
          this.contractService.asMedia(group.media),
        ),
        platform: targetInput.platform,
        publishMode: 'scheduled',
        settings: targetInput.settings ?? {},
      });
      if (!validation.valid) {
        throw this.contractService.invalidTargetException(
          targetInput,
          validation,
        );
      }

      const isExactReplay =
        target.targetExecutionState === TargetExecutionState.SCHEDULED &&
        target.scheduledDate?.getTime() === scheduledDate.getTime() &&
        this.contractService.matchesScheduleProvenance(target, provenance);
      if (!isExactReplay) {
        const updated = await tx.post.updateMany({
          data: {
            ...(provenance?.agentContextSource && {
              agentContextSource: provenance.agentContextSource,
            }),
            ...(provenance?.agentContextVersion !== undefined && {
              agentContextVersion: provenance.agentContextVersion,
            }),
            ...(provenance?.agentRunId && {
              agentRunId: provenance.agentRunId,
            }),
            ...(provenance?.agentStrategyId && {
              agentStrategyId: provenance.agentStrategyId,
            }),
            ...(provenance?.agentThreadId && {
              agentThreadId: provenance.agentThreadId,
            }),
            scheduledDate,
            status: PostStatus.SCHEDULED,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            targetReadiness: validation.readiness
              ? this.contractService.toJson(validation.readiness)
              : Prisma.JsonNull,
            targetValidationIssues:
              this.contractService.validationIssues(validation),
            targetValidationState: validation.validationState,
          },
          where: {
            groupId: group.id,
            id: target.id,
            isDeleted: false,
            organizationId,
            targetExecutionState: target.targetExecutionState,
            updatedAt: target.updatedAt,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Channel target changed while scheduling. Refresh and retry.',
          );
        }
      }

      await this.publishApprovalsService.createForCurrentPost({
        actorUserId: userId,
        ...(provenance?.agentContextVersion !== undefined && {
          contextVersion: provenance.agentContextVersion,
        }),
        mode: 'scheduled',
        organizationId,
        postId: target.id,
        provenance: {
          releaseId: group.id,
          surface: 'agent-schedule-post',
        },
        transaction: tx,
      });

      return this.persistenceService.recalculateAndHydrate(
        tx,
        organizationId,
        group.id,
        userId,
      );
    });
  }

  async update(
    organizationId: string,
    userId: string,
    groupId: string,
    body: unknown,
  ): Promise<IReleaseGroup> {
    const input = this.contractService.parseUpdateInput(body);

    const release = await this.prisma.$transaction(async (tx) => {
      const existing = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const nextStatus = input.status ?? existing.status;
      const transition =
        nextStatus !== existing.status
          ? this.contractService.appendTransition(
              existing.statusTransitions,
              existing.status,
              nextStatus,
              userId,
            )
          : undefined;

      const updated = (await tx.postGroup.update({
        data: {
          ...(input.attachments !== undefined && {
            attachments: this.contractService.toJson(input.attachments),
          }),
          ...(input.baseContent !== undefined && {
            baseContent: input.baseContent,
          }),
          ...(input.brandId !== undefined && { brandId: input.brandId }),
          ...(input.media !== undefined && {
            media: this.contractService.toJson(input.media),
          }),
          ...(input.recurrence !== undefined && {
            recurrence: input.recurrence
              ? this.contractService.toJson(input.recurrence)
              : Prisma.JsonNull,
          }),
          ...(input.scheduledDate !== undefined && {
            scheduledAt: this.contractService.toDate(input.scheduledDate),
          }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.title !== undefined && { title: input.title }),
          ...(transition !== undefined && { statusTransitions: transition }),
        },
        where: { id: existing.id },
      })) as SchedulerPostGroup;

      const targetUpdate: Record<string, unknown> = {};
      if (input.baseContent !== undefined) {
        targetUpdate.description = input.baseContent;
      }
      if (input.scheduledDate !== undefined) {
        targetUpdate.scheduledDate = this.contractService.toDate(
          input.scheduledDate,
        );
      }
      if (input.timezone !== undefined) {
        targetUpdate.timezone = input.timezone;
      }
      if (input.status !== undefined) {
        targetUpdate.status = this.contractService.toPostStatus(input.status);
        targetUpdate.targetExecutionState = this.contractService.toTargetState(
          input.status,
        );
      }

      if (Object.keys(targetUpdate).length > 0) {
        await tx.post.updateMany({
          data: targetUpdate,
          where: {
            groupId: existing.id,
            isDeleted: false,
            organizationId,
            targetExecutionState: { in: Array.from(GROUP_ACTION_STATES) },
          },
        });
      }

      const targets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        existing.id,
      );
      return this.contractService.toReleaseGroup(updated, targets);
    });
    if (
      input.attachments !== undefined ||
      input.baseContent !== undefined ||
      input.brandId !== undefined ||
      input.media !== undefined ||
      input.recurrence !== undefined ||
      input.scheduledDate !== undefined ||
      input.timezone !== undefined
    ) {
      await this.invalidateReleaseApprovals(
        release,
        userId,
        'Release content, brand, destinations, or protected schedule intent changed.',
      );
    }
    return release;
  }

  async updateTarget(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    body: unknown,
  ): Promise<IReleaseGroup> {
    const input = this.contractService.parseTargetInput(body);

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const existing = await this.persistenceService.getTargetOrThrow(
        tx,
        organizationId,
        group.id,
        targetId,
      );

      const validation = this.contractService.validateTargetUpdate(
        existing,
        input,
      );

      const { isManualRetry, manualRetryApproval } =
        await this.resolveManualRetry({
          existing,
          groupId,
          input,
          organizationId,
          targetId,
          tx,
          userId,
        });

      await tx.post.update({
        data: {
          ...(input.error !== undefined && {
            targetError: input.error
              ? this.contractService.toJson(input.error)
              : Prisma.JsonNull,
          }),
          ...(input.executionState !== undefined && {
            status: input.executionState,
            targetExecutionState: input.executionState,
          }),
          ...(isManualRetry && {
            lastAttemptAt: null,
            retryCount: 0,
            targetError: Prisma.JsonNull,
          }),
          ...(input.externalProviderId !== undefined && {
            externalId: input.externalProviderId,
          }),
          ...(input.externalShortcode !== undefined && {
            externalShortcode: input.externalShortcode,
          }),
          ...(input.idempotencyKey !== undefined && {
            targetIdempotencyKey: input.idempotencyKey,
          }),
          ...(input.lastAttemptAt !== undefined && {
            lastAttemptAt: this.contractService.toDate(input.lastAttemptAt),
          }),
          ...(input.order !== undefined && { order: input.order }),
          ...(input.publishedAt !== undefined && {
            publishedAt: this.contractService.toDate(input.publishedAt),
          }),
          ...(input.readiness !== undefined && {
            targetReadiness: input.readiness
              ? this.contractService.toJson(input.readiness)
              : Prisma.JsonNull,
          }),
          ...(input.retryCount !== undefined && {
            retryCount: input.retryCount,
          }),
          ...(input.scheduledDate !== undefined && {
            scheduledDate: this.contractService.toDate(input.scheduledDate),
          }),
          ...(input.settings !== undefined && {
            targetSettings: this.contractService.toJson(input.settings),
          }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.url !== undefined && { url: input.url }),
          ...(input.validationIssues !== undefined && {
            targetValidationIssues: input.validationIssues,
          }),
          ...(input.validationState !== undefined && {
            targetValidationState: input.validationState,
          }),
          ...(validation && {
            targetValidationIssues:
              this.contractService.validationIssues(validation),
            targetValidationState: validation.validationState,
          }),
        },
        where: { id: existing.id },
      });

      return {
        manualRetryApproval,
        release: await this.persistenceService.recalculateAndHydrate(
          tx,
          organizationId,
          group.id,
          userId,
        ),
      };
    });
    if (
      input.scheduledDate !== undefined ||
      input.settings !== undefined ||
      input.timezone !== undefined
    ) {
      await this.publishApprovalsService.invalidatePost(
        organizationId,
        targetId,
        'Channel destination settings or protected schedule intent changed.',
        userId,
      );
    }
    if (result.manualRetryApproval) {
      const approval = result.manualRetryApproval;
      if (approval.status !== PublishApprovalStatus.QUEUED) {
        await this.publishApprovalsService.markQueued(
          approval.id,
          organizationId,
          userId,
        );
      }
      await this.postPublishQueueService.enqueue({
        approvalId: approval.id,
        operationId: approval.operationId,
        organizationId,
        postId: targetId,
        source: 'manual_retry',
        userId,
        versionPinId: approval.artifactVersionPinId,
      });
    }
    return result.release;
  }

  private async resolveManualRetry(
    params: ResolveManualRetryParams,
  ): Promise<ManualRetryResolution> {
    const isManualRetry =
      params.existing.targetExecutionState === TargetExecutionState.FAILED &&
      params.input.executionState === TargetExecutionState.SCHEDULED;
    if (isManualRetry) {
      const approval = await this.publishApprovalsService.createForCurrentPost({
        actorUserId: params.userId,
        mode: 'scheduled',
        organizationId: params.organizationId,
        postId: params.targetId,
        provenance: {
          releaseId: params.groupId,
          surface: 'post-groups-manual-retry',
        },
        transaction: params.tx,
      });
      const provenance = {
        ...approval.provenance,
        manualRetryCommand: {
          releaseId: params.groupId,
          requestedByUserId: params.userId,
          targetId: params.targetId,
          version: 1,
        },
      };
      await params.tx.publishApproval.update({
        data: { provenance: this.contractService.toJson(provenance) },
        where: { id: approval.id },
      });
      return {
        isManualRetry,
        manualRetryApproval: { ...approval, provenance },
      };
    }

    const approvalId = params.existing.publishApprovalId;
    const canReplay =
      params.existing.targetExecutionState === TargetExecutionState.SCHEDULED &&
      params.input.executionState === TargetExecutionState.SCHEDULED &&
      approvalId;
    if (!canReplay) {
      return { isManualRetry };
    }

    const row = await params.tx.publishApproval.findFirst({
      where: {
        id: approvalId,
        organizationId: params.organizationId,
        postId: params.targetId,
      },
    });
    if (!row) {
      return { isManualRetry };
    }

    const approval = this.publishApprovalsService.toPublicInterface(row);
    const isDurableRetry =
      (approval.status === PublishApprovalStatus.APPROVED ||
        approval.status === PublishApprovalStatus.QUEUED ||
        approval.status === PublishApprovalStatus.FAILED) &&
      approval.provenance.manualRetryCommand;

    return {
      isManualRetry,
      ...(isDurableRetry && { manualRetryApproval: approval }),
    };
  }

  cancel(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.CANCELLED,
    );
  }

  pause(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.PAUSED,
      [TargetExecutionState.SCHEDULED],
    );
  }

  resume(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.SCHEDULED,
      [TargetExecutionState.PAUSED],
    );
  }

  async publishNow(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const release = await this.prisma.$transaction(async (tx) => {
      const group = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const targets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        group.id,
      );

      for (const target of targets) {
        const validation = validateChannelTargetSettings({
          caption: group.baseContent,
          credentialId: target.credentialId,
          media: this.contractService.toValidationMedia(
            this.contractService.asMedia(group.media),
          ),
          platform: target.platform,
          publishMode: 'publish_now',
          settings: this.contractService.asRecord(target.targetSettings),
        });

        if (!validation.valid) {
          throw this.contractService.invalidTargetException(
            {
              credentialId: target.credentialId,
              platform: target.platform as CredentialPlatform,
            },
            validation,
          );
        }
      }

      await tx.post.updateMany({
        data: {
          scheduledDate: new Date(),
          status: TargetExecutionState.SCHEDULED,
          targetExecutionState: TargetExecutionState.SCHEDULED,
        },
        where: {
          groupId: group.id,
          isDeleted: false,
          organizationId,
          targetExecutionState: { in: Array.from(GROUP_ACTION_STATES) },
        },
      });

      return this.persistenceService.recalculateAndHydrate(
        tx,
        organizationId,
        group.id,
        userId,
      );
    });

    await this.approveReleaseTargets(release, userId, 'immediate');
    await this.enqueueReleaseTargets(release, userId);
    return release;
  }

  private async enqueueReleaseTargets(
    release: IReleaseGroup,
    userId: string,
  ): Promise<void> {
    const targets = (release.targets ?? []).filter(
      (target) => target.executionState === TargetExecutionState.SCHEDULED,
    );
    if (targets.length === 0) {
      return;
    }

    const durableTargets = await this.prisma.post.findMany({
      select: {
        id: true,
        publishApproval: {
          select: {
            artifactVersionPinId: true,
            id: true,
            operationId: true,
          },
        },
      },
      where: {
        id: { in: targets.map((target) => target.id) },
        isDeleted: false,
        organizationId: release.organizationId,
      },
    });
    const approvals = new Map(
      durableTargets.map((target) => [target.id, target.publishApproval]),
    );

    await Promise.all(
      targets.map(async (target) => {
        const approval = approvals.get(target.id);
        if (!approval) {
          throw new ConflictException(
            `Target ${target.id} has no version-bound publish approval.`,
          );
        }
        await this.publishApprovalsService.markQueued(
          approval.id,
          release.organizationId,
          userId,
        );
        return this.postPublishQueueService.enqueue({
          approvalId: approval.id,
          operationId: approval.operationId,
          organizationId: release.organizationId,
          postId: target.id,
          source: 'publish_now',
          userId,
          versionPinId: approval.artifactVersionPinId,
        });
      }),
    );
  }

  private async approveReleaseTargets(
    release: IReleaseGroup,
    userId: string,
    mode: 'immediate' | 'scheduled',
  ): Promise<void> {
    try {
      await Promise.all(
        (release.targets ?? []).map((target) =>
          this.publishApprovalsService.createForCurrentPost({
            actorUserId: userId,
            mode,
            organizationId: release.organizationId,
            postId: target.id,
            provenance: {
              releaseId: release.id,
              surface: 'post-groups',
            },
          }),
        ),
      );
    } catch (error: unknown) {
      await this.prisma.$transaction([
        this.prisma.post.updateMany({
          data: {
            status: TargetExecutionState.PAUSED,
            targetExecutionState: TargetExecutionState.PAUSED,
          },
          where: {
            groupId: release.id,
            isDeleted: false,
            organizationId: release.organizationId,
          },
        }),
        this.prisma.postGroup.update({
          data: { status: ReleaseStatus.PAUSED },
          where: { id: release.id },
        }),
      ]);
      throw error;
    }
  }

  private async transitionGroupTargets(
    organizationId: string,
    userId: string,
    groupId: string,
    nextState: TargetExecutionState,
    fromStates: readonly TargetExecutionState[] = Array.from(
      GROUP_ACTION_STATES,
    ) as TargetExecutionState[],
  ): Promise<IReleaseGroup> {
    const release = await this.prisma.$transaction(async (tx) => {
      const group = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      await tx.post.updateMany({
        data: {
          status: nextState,
          targetExecutionState: nextState,
        },
        where: {
          groupId: group.id,
          isDeleted: false,
          organizationId,
          targetExecutionState: { in: [...fromStates] },
        },
      });

      return this.persistenceService.recalculateAndHydrate(
        tx,
        organizationId,
        group.id,
        userId,
      );
    });
    if (nextState === TargetExecutionState.CANCELLED) {
      await this.invalidateReleaseApprovals(
        release,
        userId,
        'The scheduled release was cancelled.',
      );
    }
    return release;
  }

  private async invalidateReleaseApprovals(
    release: IReleaseGroup,
    userId: string,
    reason: string,
  ): Promise<void> {
    await Promise.all(
      (release.targets ?? []).map((target) =>
        this.publishApprovalsService.invalidatePost(
          release.organizationId,
          target.id,
          reason,
          userId,
        ),
      ),
    );
  }
}
