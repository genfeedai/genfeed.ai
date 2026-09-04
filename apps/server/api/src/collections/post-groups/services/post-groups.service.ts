import type { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import type { SchedulerPostGroup } from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import {
  applyReleaseTargetUpdates,
  GROUP_ACTION_STATES,
  type PostGroupTargetOperationDependencies,
  schedulePostGroupTarget,
  updatePostGroupTarget,
} from '@api/collections/post-groups/services/post-group-target.operations';
import type { ScheduledPostWorkflowSource } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
  type PublishingCapability,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { PostLifecycleService, scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { validateChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type {
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

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
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
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
    return schedulePostGroupTarget(
      {
        groupId,
        organizationId,
        provenance,
        scheduledDate,
        targetId,
        userId,
        workflowSource,
      },
      this.targetOperationDependencies(),
    );
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
      const nextBrandId = input.brandId ?? existing.brandId;
      const nextCampaignId =
        input.campaignId === undefined ? existing.campaignId : input.campaignId;
      const changesCampaignScope =
        input.campaignId !== undefined ||
        (input.brandId !== undefined && existing.campaignId !== null);
      if (nextCampaignId && changesCampaignScope) {
        await this.persistenceService.assertCampaignScope(
          tx,
          organizationId,
          nextCampaignId,
          nextBrandId,
        );
      }
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
          ...(input.campaignId !== undefined && {
            campaignId: input.campaignId,
          }),
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

      // Campaign membership belongs to the whole release, including targets
      // that already published, so it is not gated on lifecycle state.
      if (input.campaignId !== undefined) {
        await tx.post.updateMany({
          data: { campaignId: input.campaignId },
          where: scopedWhere(organizationId, { groupId: existing.id }),
        });
      }

      await applyReleaseTargetUpdates(
        tx,
        {
          currentTargets,
          groupId: existing.id,
          input,
          organizationId,
          userId,
        },
        this.targetOperationDependencies(),
      );

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
    return updatePostGroupTarget(
      {
        apiKeyContext,
        body,
        groupId,
        organizationId,
        targetId,
        userId,
      },
      this.targetOperationDependencies(),
    );
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

  private targetOperationDependencies(): PostGroupTargetOperationDependencies {
    return {
      contractService: this.contractService,
      enqueueReleaseTargets: (release, userId, targetIds, source) =>
        this.enqueueReleaseTargets(release, userId, targetIds, source),
      persistenceService: this.persistenceService,
      postLifecycleService: this.postLifecycleService,
      prisma: this.prisma,
      publishApprovalsService: this.publishApprovalsService,
      readinessService: this.readinessService,
      scheduledPostWorkflowQueue: this.scheduledPostWorkflowQueue,
    };
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
