import { validateChannelTargetSettings } from '@api-types/contracts/channel-capabilities.contract';
import type {
  ChannelTargetInput,
  UpdateChannelTargetInput,
} from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  PostCategory,
  PublishApprovalStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import {
  type PostLifecycleMutation,
  PostLifecycleService,
  scopedWhere,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { PostGroupsQueryDto } from '@server/collections/post-groups/dto/post-groups-query.dto';
import type {
  ManualRetryResolution,
  ResolveManualRetryParams,
  SchedulerPostGroup,
} from '@server/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@server/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@server/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@server/collections/post-groups/services/post-group-readiness.service';
import type { ScheduledPostWorkflowSource } from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@server/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
  type PublishingCapability,
} from '@server/helpers/utils/auth/api-key-publishing-scope.util';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const GROUP_ACTION_STATES = new Set<string>([
  TargetExecutionState.DRAFT,
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.FAILED,
]);

function changesPublishedTargetState(input: UpdateChannelTargetInput): boolean {
  return (
    input.executionState === TargetExecutionState.PUBLISHED ||
    input.executionState === TargetExecutionState.PUBLISHING ||
    input.externalProviderId !== undefined ||
    input.externalShortcode !== undefined ||
    input.publishedAt !== undefined ||
    input.url !== undefined
  );
}

function publishingCapabilityForReleaseStatus(
  status: ReleaseStatus,
): PublishingCapability {
  if (status === ReleaseStatus.DRAFT) {
    return 'draft';
  }
  if (
    status === ReleaseStatus.PUBLISHED ||
    status === ReleaseStatus.PUBLISHING ||
    status === ReleaseStatus.PARTIALLY_PUBLISHED
  ) {
    return 'publish';
  }
  return 'schedule';
}

@Injectable()
export class PostGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly scheduledPostWorkflowQueue: ScheduledPostWorkflowQueueService,
    private readonly postLifecycleService: PostLifecycleService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly persistenceService: PostGroupPersistenceService,
    private readonly contractService: PostGroupContractService,
    private readonly readinessService: PostGroupReadinessService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    body: unknown,
    headerIdempotencyKey?: string,
    provenance?: PostGroupCreateProvenance,
    apiKeyContext?: ApiKeyPublishingContext,
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
        assertApiKeyPublishingScope(
          apiKeyContext ?? {},
          publishingCapabilityForReleaseStatus(existing.status),
        );
        if (existing.status === ReleaseStatus.SCHEDULED) {
          await this.approveReleaseTargets(existing, userId, 'scheduled');
        }
        return existing;
      }
    }

    const status = this.contractService.resolveCreateStatus(input);
    assertApiKeyPublishingScope(
      apiKeyContext ?? {},
      status === ReleaseStatus.DRAFT ? 'draft' : 'schedule',
    );
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
    const analyticsByTarget =
      await this.persistenceService.getLatestTargetAnalytics(
        this.prisma,
        organizationId,
        targets,
      );
    return this.contractService.toReleaseGroup(
      group,
      targets,
      analyticsByTarget,
    );
  }

  list(organizationId: string, query: PostGroupsQueryDto) {
    return this.persistenceService.listReleaseGroups({
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.contentType?.length ? { categories: query.contentType } : {}),
      ...(query.credentialId?.length
        ? { credentialIds: query.credentialId }
        : {}),
      ...(query.endDate ? { endDate: new Date(query.endDate) } : {}),
      ...(query.executionState?.length
        ? { executionStates: query.executionState }
        : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      organizationId,
      ...(query.page ? { page: query.page } : {}),
      ...(query.platform?.length ? { platforms: query.platform } : {}),
      ...(query.publicationState
        ? { publicationState: query.publicationState }
        : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.sort ? { sort: query.sort } : {}),
      ...(query.source?.length ? { sources: query.source } : {}),
      ...(query.startDate ? { startDate: new Date(query.startDate) } : {}),
      ...(query.status?.length ? { statuses: query.status } : {}),
    });
  }

  async scheduleTarget(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    scheduledAt: string,
    provenance?: PostGroupCreateProvenance,
  ): Promise<IReleaseGroup> {
    return this.scheduleTargetAt(
      organizationId,
      userId,
      groupId,
      targetId,
      this.contractService.parseFutureScheduleDate(scheduledAt),
      provenance,
    );
  }

  /**
   * Publish one target immediately, stamped with server time. A client
   * timestamp round-tripped through the strict future validator turns
   * "Publish now" into a 400 (clock skew / latency puts it >1s in the past)
   * or a silent schedule (skew ahead pushes it past the due-now window), so
   * the explicit action carries no timestamp at all.
   */
  async publishTargetNow(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    provenance?: PostGroupCreateProvenance,
  ): Promise<IReleaseGroup> {
    return this.scheduleTargetAt(
      organizationId,
      userId,
      groupId,
      targetId,
      new Date(),
      provenance,
    );
  }

  async publishTargetViaTikTokApp(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    provenance?: PostGroupCreateProvenance,
  ): Promise<IReleaseGroup> {
    return this.scheduleTargetAt(
      organizationId,
      userId,
      groupId,
      targetId,
      new Date(),
      provenance,
      'tiktok_app',
    );
  }

  private async scheduleTargetAt(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    scheduledDate: Date,
    provenance?: PostGroupCreateProvenance,
    workflowSource: ScheduledPostWorkflowSource = 'publish_now',
  ): Promise<IReleaseGroup> {
    const isDueNow = scheduledDate.getTime() <= Date.now() + 5000;

    const scheduled = await this.prisma.$transaction(async (tx) => {
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
      if (
        workflowSource === 'tiktok_app' &&
        (platform !== CredentialPlatform.TIKTOK ||
          (target.category !== PostCategory.VIDEO &&
            target.category !== PostCategory.REEL))
      ) {
        throw new BadRequestException(
          'Publish via TikTok App is only available for TikTok videos.',
        );
      }
      const targetInput: ChannelTargetInput = {
        credentialId: target.credentialId,
        platform,
        scheduledDate: scheduledDate.toISOString(),
        settings: this.contractService.asRecord(target.targetSettings),
        timezone: target.timezone,
        visibility: this.contractService.toPostVisibility(target.visibility),
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
        publishMode: isDueNow ? 'publish_now' : 'scheduled',
        settings: targetInput.settings ?? {},
        visibility: targetInput.visibility,
      });
      if (!validation.valid) {
        throw this.contractService.invalidTargetException(
          targetInput,
          validation,
        );
      }

      const readinessByCredential =
        await this.readinessService.resolveForCredentials(tx, organizationId, [
          targetInput.credentialId,
        ]);
      const readiness = readinessByCredential.get(targetInput.credentialId);
      this.readinessService.assertSchedulable(targetInput, readiness);

      const isExactReplay =
        target.targetExecutionState === TargetExecutionState.SCHEDULED &&
        target.scheduledDate?.getTime() === scheduledDate.getTime() &&
        this.contractService.matchesScheduleProvenance(target, provenance);
      if (!isExactReplay) {
        const transition = await this.postLifecycleService.transition(
          {
            actorId: userId,
            groupId: group.id,
            guard: {
              expectedUpdatedAt: target.updatedAt,
              priorExecutionStates: [
                target.targetExecutionState as TargetExecutionState,
              ],
            },
            mutation: {
              ...(provenance?.agentContextSource && {
                agentContextSource: provenance.agentContextSource,
              }),
              ...(provenance?.agentContextVersion !== undefined && {
                agentContextVersion: provenance.agentContextVersion,
              }),
              ...(provenance?.workflowExecutionId && {
                workflowExecutionId: provenance.workflowExecutionId,
              }),
              ...(provenance?.agentStrategyId && {
                agentStrategyId: provenance.agentStrategyId,
              }),
              ...(provenance?.agentThreadId && {
                agentThreadId: provenance.agentThreadId,
              }),
              scheduledDate,
              targetReadiness: this.contractService.toReadinessJson(
                readiness ?? validation.readiness,
              ),
              targetValidationIssues:
                this.contractService.validationIssues(validation),
              targetValidationState: validation.validationState,
            },
            nextState: TargetExecutionState.SCHEDULED,
            organizationId,
            postId: target.id,
            reason: 'Channel target scheduled',
          },
          tx,
        );
        if (transition.kind === 'stale') {
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
        mode: isDueNow ? 'immediate' : 'scheduled',
        organizationId,
        postId: target.id,
        provenance: {
          releaseId: group.id,
          surface:
            provenance?.source === 'post-desk'
              ? 'post-desk-schedule'
              : 'agent-schedule-post',
        },
        transaction: tx,
      });

      const release = await this.persistenceService.hydrateWithDerivedStatus(
        tx,
        organizationId,
        group.id,
      );
      return { isDueNow, release };
    });

    if (scheduled.isDueNow) {
      await this.enqueueReleaseTargets(
        scheduled.release,
        userId,
        [targetId],
        workflowSource,
      );
    }
    return scheduled.release;
  }

  /**
   * Desk posts created through `/posts` are not always release targets.
   * Bind the existing root post to a draft PostGroup so Schedule / Publish now
   * can reuse `scheduleTarget` / `publishNow` without inventing a second post.
   */
  async ensureReleaseForPost(
    organizationId: string,
    userId: string,
    postId: string,
  ): Promise<IReleaseGroup> {
    if (!postId) {
      throw new BadRequestException('postId is required.');
    }

    const post = await this.prisma.post.findFirst({
      include: { ingredients: { select: { id: true } } },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!post) {
      throw new NotFoundException('Post', postId);
    }
    if (post.parentId) {
      throw new BadRequestException(
        'Schedule the thread root. Replies cannot be scheduled as their own release.',
      );
    }
    if (post.groupId) {
      const existing = await this.prisma.postGroup.findFirst({
        where: scopedWhere(organizationId, { id: post.groupId }),
      });
      if (existing) {
        return this.persistenceService.hydrateWithDerivedStatus(
          this.prisma,
          organizationId,
          existing.id,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = this.contractService.buildTransition(
        null,
        ReleaseStatus.DRAFT,
        userId,
      );
      const mediaKind =
        post.category === PostCategory.VIDEO ||
        post.category === PostCategory.REEL
          ? 'video'
          : 'image';
      const media = post.ingredients.map((ingredient, order) => ({
        assetId: ingredient.id,
        kind: mediaKind,
        order,
      }));
      const group = await tx.postGroup.create({
        data: {
          attachments: this.contractService.toJson([]),
          baseContent: post.description,
          brandId: post.brandId,
          media: this.contractService.toJson(media),
          organizationId,
          ownerId: userId,
          status: ReleaseStatus.DRAFT,
          statusTransitions: this.contractService.toJson([transition]),
          timezone: post.timezone || 'UTC',
          title:
            post.label?.trim() ||
            post.description.slice(0, 100) ||
            'Untitled post',
        },
      });
      await tx.post.updateMany({
        data: { groupId: group.id },
        where: scopedWhere(organizationId, { id: post.id }),
      });
      return this.persistenceService.hydrateWithDerivedStatus(
        tx,
        organizationId,
        group.id,
      );
    });
  }

  async update(
    organizationId: string,
    userId: string,
    groupId: string,
    body: unknown,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<IReleaseGroup> {
    const input = this.contractService.parseUpdateInput(body);

    const release = await this.prisma.$transaction(async (tx) => {
      const existing = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const currentTargets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        existing.id,
      );
      const currentStatus = this.contractService.deriveReleaseStatus(
        existing.id,
        currentTargets.map((target) => target.targetExecutionState),
      );
      const nextStatus = input.status ?? currentStatus;
      const changesPublishState =
        nextStatus === ReleaseStatus.PUBLISHED ||
        nextStatus === ReleaseStatus.PUBLISHING ||
        nextStatus === ReleaseStatus.PARTIALLY_PUBLISHED;
      const changesScheduleIntent =
        !changesPublishState &&
        (currentStatus !== ReleaseStatus.DRAFT ||
          nextStatus !== ReleaseStatus.DRAFT ||
          input.recurrence !== undefined ||
          input.scheduledDate !== undefined ||
          input.timezone !== undefined);
      assertApiKeyPublishingScope(
        apiKeyContext ?? {},
        changesPublishState
          ? 'publish'
          : changesScheduleIntent
            ? 'schedule'
            : 'draft',
      );
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
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.title !== undefined && { title: input.title }),
        },
        where: scopedWhere(organizationId, { id: existing.id }),
      })) as SchedulerPostGroup;

      const targetUpdate: PostLifecycleMutation = {};
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
        const nextState = this.contractService.toTargetState(input.status);
        for (const target of currentTargets) {
          if (!GROUP_ACTION_STATES.has(target.targetExecutionState)) {
            continue;
          }
          await this.postLifecycleService.transition(
            {
              actorId: userId,
              groupId: existing.id,
              mutation: targetUpdate,
              nextState,
              organizationId,
              postId: target.id,
              reason: 'Release lifecycle updated',
            },
            tx,
          );
        }
      } else if (Object.keys(targetUpdate).length > 0) {
        await tx.post.updateMany({
          data: targetUpdate,
          where: scopedWhere(organizationId, {
            groupId: existing.id,
            targetExecutionState: { in: Array.from(GROUP_ACTION_STATES) },
          }),
        });
      }

      const targets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        existing.id,
      );
      const analyticsByTarget =
        await this.persistenceService.getLatestTargetAnalytics(
          tx,
          organizationId,
          targets,
        );
      return this.contractService.toReleaseGroup(
        updated,
        targets,
        analyticsByTarget,
      );
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

  /**
   * Update only the release's calendar placement. Never writes channel-target
   * schedule columns and never enqueues a publish.
   */
  async moveCalendarPlacement(
    organizationId: string,
    _userId: string,
    groupId: string,
    body: unknown,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<IReleaseGroup> {
    assertApiKeyPublishingScope(apiKeyContext ?? {}, 'schedule');
    const scheduledAt = this.contractService.parseScheduleDate(
      this.contractService.readScheduledDate(body),
    );

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      await tx.postGroup.update({
        data: { scheduledAt },
        where: scopedWhere(organizationId, { id: existing.id }),
      });
      return this.persistenceService.hydrateWithDerivedStatus(
        tx,
        organizationId,
        existing.id,
      );
    });
  }

  /**
   * Publish again at `scheduledDate` through the existing release contract.
   * Live posts clone a new scheduled occurrence; unpublished queued items
   * reschedule in place. Neither path edits a live provider post.
   */
  async republishAt(
    organizationId: string,
    userId: string,
    groupId: string,
    body: unknown,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<IReleaseGroup> {
    assertApiKeyPublishingScope(apiKeyContext ?? {}, 'schedule');
    const scheduledDate = this.contractService.readScheduledDate(body);
    this.contractService.parseFutureScheduleDate(scheduledDate);

    const existing = await this.prisma.$transaction(async (tx) => {
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
      return { group, targets };
    });

    if (this.contractService.hasPublishedTarget(existing.targets)) {
      const idempotencyKey = `calendar-republish:${groupId}:${scheduledDate}`;
      return this.create(
        organizationId,
        userId,
        {
          ...this.contractService.buildRepublishCreateInput(
            existing.group,
            existing.targets,
            scheduledDate,
          ),
          idempotencyKey,
        },
        idempotencyKey,
        { source: 'calendar-republish' },
        apiKeyContext,
      );
    }

    return this.update(
      organizationId,
      userId,
      groupId,
      { scheduledDate },
      apiKeyContext,
    );
  }

  async updateTarget(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    body: unknown,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<IReleaseGroup> {
    const input = this.contractService.parseTargetInput(body);
    assertApiKeyPublishingScope(
      apiKeyContext ?? {},
      changesPublishedTargetState(input) ? 'publish' : 'schedule',
    );

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

      const targetMutation: PostLifecycleMutation = {
        ...(isManualRetry && {
          lastAttemptAt: null,
          retryCount: 0,
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
        ...(input.visibility !== undefined && {
          visibility: input.visibility,
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
      };
      if (input.executionState !== undefined) {
        await this.postLifecycleService.transition(
          {
            actorId: userId,
            error: isManualRetry ? null : input.error,
            groupId: group.id,
            mutation: targetMutation,
            nextState: input.executionState,
            organizationId,
            postId: existing.id,
            reason: isManualRetry ? 'Manual retry requested' : undefined,
          },
          tx,
        );
      } else {
        await tx.post.updateMany({
          data: {
            ...targetMutation,
            ...(input.error !== undefined && {
              targetError: input.error
                ? this.contractService.toJson(input.error)
                : Prisma.JsonNull,
            }),
          },
          where: scopedWhere(organizationId, { id: existing.id }),
        });
      }

      return {
        manualRetryApproval,
        release: await this.persistenceService.hydrateWithDerivedStatus(
          tx,
          organizationId,
          group.id,
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
      await this.scheduledPostWorkflowQueue.enqueue({
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
      Boolean(approval.provenance.manualRetryCommand);

    return isDurableRetry
      ? { isManualRetry, manualRetryApproval: approval }
      : { isManualRetry };
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

      /**
       * Readiness is resolved inside the write transaction, exactly as
       * `scheduleTarget` does, so the verdict and the rows it gates come from
       * one snapshot. Drafts are saved ungated on purpose, so for the agent's
       * immediate-publish path — draft group, then publish-now — this is the
       * only readiness gate the release ever passes through. Only the targets
       * this call transitions are gated: a cancelled or already-published
       * sibling is never queued, so its channel cannot block the rest.
       */
      const readinessByCredential =
        await this.readinessService.resolveForCredentials(
          tx,
          organizationId,
          targets
            .filter((target) =>
              GROUP_ACTION_STATES.has(target.targetExecutionState),
            )
            .map((target) => target.credentialId),
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
          visibility: this.contractService.toPostVisibility(target.visibility),
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

        if (GROUP_ACTION_STATES.has(target.targetExecutionState)) {
          this.readinessService.assertSchedulable(
            {
              credentialId: target.credentialId,
              platform: target.platform,
            },
            readinessByCredential.get(target.credentialId),
          );
        }
      }

      const scheduledDate = new Date();
      for (const target of targets) {
        if (!GROUP_ACTION_STATES.has(target.targetExecutionState)) {
          continue;
        }
        await this.postLifecycleService.transition(
          {
            actorId: userId,
            groupId: group.id,
            mutation: { scheduledDate },
            nextState: TargetExecutionState.SCHEDULED,
            organizationId,
            postId: target.id,
            reason: 'Immediate publish queued',
          },
          tx,
        );
      }

      return this.persistenceService.hydrateWithDerivedStatus(
        tx,
        organizationId,
        group.id,
      );
    });

    await this.approveReleaseTargets(release, userId, 'immediate');
    await this.enqueueReleaseTargets(release, userId);
    return release;
  }

  private async enqueueReleaseTargets(
    release: IReleaseGroup,
    userId: string,
    targetIds?: string[],
    source: ScheduledPostWorkflowSource = 'publish_now',
  ): Promise<void> {
    const allowedIds = targetIds ? new Set(targetIds) : null;
    const targets = (release.targets ?? []).filter(
      (target) =>
        target.executionState === TargetExecutionState.SCHEDULED &&
        (allowedIds ? allowedIds.has(target.id) : true),
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
      where: scopedWhere(release.organizationId, {
        id: { in: targets.map((target) => target.id) },
      }),
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
        return this.scheduledPostWorkflowQueue.enqueue({
          approvalId: approval.id,
          operationId: approval.operationId,
          organizationId: release.organizationId,
          postId: target.id,
          source,
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
      await this.transitionGroupTargets(
        release.organizationId,
        userId,
        release.id,
        TargetExecutionState.PAUSED,
      );
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
      const targets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        group.id,
      );
      for (const target of targets) {
        if (
          !fromStates.includes(
            target.targetExecutionState as TargetExecutionState,
          )
        ) {
          continue;
        }
        await this.postLifecycleService.transition(
          {
            actorId: userId,
            groupId: group.id,
            nextState,
            organizationId,
            postId: target.id,
            reason: `Release targets moved to ${nextState}`,
          },
          tx,
        );
      }

      return this.persistenceService.hydrateWithDerivedStatus(
        tx,
        organizationId,
        group.id,
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
