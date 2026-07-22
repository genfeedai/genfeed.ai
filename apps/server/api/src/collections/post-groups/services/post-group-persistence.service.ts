import type {
  CreateAttachmentPostsParams,
  CreatePostGroupParams,
  ReleaseGroupListQuery,
  SchedulerCredential,
  SchedulerPostAnalytics,
  SchedulerPostGroup,
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ChannelTargetInput,
  deriveReleaseStatusFromTargets,
} from '@api-types/contracts/scheduler.contract';
import {
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class PostGroupPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: PostGroupContractService,
  ) {}

  async createPostGroup(
    tx: SchedulerTx,
    params: CreatePostGroupParams,
  ): Promise<IReleaseGroup> {
    const credentials = await this.resolveCredentials(
      tx,
      params.organizationId,
      params.input.targets,
    );
    const brandId = await this.resolveBrandId(
      tx,
      params.organizationId,
      params.input.brandId,
      credentials,
    );
    const validations = params.input.targets.map((target) => {
      const validation = this.contractService.validateTarget(
        params.input,
        target,
        params.status === ReleaseStatus.DRAFT ? 'draft' : 'scheduled',
      );
      if (!validation.valid && params.status !== ReleaseStatus.DRAFT) {
        throw this.contractService.invalidTargetException(target, validation);
      }
      return validation;
    });
    const transition = this.contractService.buildTransition(
      null,
      params.status,
      params.userId,
    );
    const group = (await tx.postGroup.create({
      data: {
        attachments: this.contractService.toJson(
          params.input.attachments ?? [],
        ),
        baseContent: params.input.baseContent,
        brandId,
        idempotencyKey: params.input.idempotencyKey ?? null,
        media: this.contractService.toJson(params.input.media ?? []),
        organizationId: params.organizationId,
        ownerId: params.userId,
        recurrence: params.input.recurrence
          ? this.contractService.toJson(params.input.recurrence)
          : Prisma.JsonNull,
        scheduledAt: params.scheduledAt,
        status: params.status,
        statusTransitions: this.contractService.toJson([transition]),
        timezone: params.input.timezone,
        title: params.input.title,
      },
    })) as SchedulerPostGroup;

    const targets: SchedulerPostTarget[] = [];
    for (const [index, target] of params.input.targets.entries()) {
      const credential = credentials.get(target.credentialId);
      if (!credential) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not available for this organization.`,
        );
      }

      const validation = validations[index];
      if (!validation) {
        throw new BadRequestException(
          'Missing channel target validation result.',
        );
      }

      const created = (await tx.post.create({
        data: {
          ...(params.provenance?.agentContextSource && {
            agentContextSource: params.provenance.agentContextSource,
          }),
          ...(params.provenance?.agentContextVersion !== undefined && {
            agentContextVersion: params.provenance.agentContextVersion,
          }),
          ...(params.provenance?.agentRunId && {
            agentRunId: params.provenance.agentRunId,
          }),
          ...(params.provenance?.agentStrategyId && {
            agentStrategyId: params.provenance.agentStrategyId,
          }),
          ...(params.provenance?.agentThreadId && {
            agentThreadId: params.provenance.agentThreadId,
          }),
          brandId,
          credentialId: target.credentialId,
          description: params.input.baseContent,
          groupId: group.id,
          ingredients: this.contractService.buildIngredientConnect(
            params.input.media,
          ),
          label: params.input.title,
          order: target.order ?? index,
          organizationId: params.organizationId,
          platform: target.platform,
          ...(params.provenance?.source && {
            source: params.provenance.source,
          }),
          ...(params.provenance?.sourceActionId && {
            sourceActionId: params.provenance.sourceActionId,
          }),
          scheduledDate:
            this.contractService.toDate(target.scheduledDate) ??
            group.scheduledAt,
          status: this.contractService.toPostStatus(params.status),
          targetAttachments: this.contractService.toJson(
            target.attachments ?? [],
          ),
          targetExecutionState: this.contractService.toTargetState(
            params.status,
          ),
          targetReadiness: validation.readiness
            ? this.contractService.toJson(validation.readiness)
            : Prisma.JsonNull,
          targetSettings: this.contractService.toJson(target.settings ?? {}),
          targetValidationIssues:
            this.contractService.validationIssues(validation),
          targetValidationState: validation.validationState,
          timezone: target.timezone ?? params.input.timezone,
          userId: params.userId,
        },
      })) as SchedulerPostTarget;

      await this.createAttachmentPosts(tx, {
        brandId,
        group,
        input: params.input,
        parent: created,
        target,
        userId: params.userId,
      });

      targets.push(created);
    }

    return this.contractService.toReleaseGroup(group, targets);
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<IReleaseGroup | undefined> {
    const group = (await this.prisma.postGroup.findFirst({
      where: { idempotencyKey, isDeleted: false, organizationId },
    })) as SchedulerPostGroup | null;

    if (!group) {
      return undefined;
    }

    const targets = await this.getTargets(
      this.prisma,
      organizationId,
      group.id,
    );
    const analyticsByTarget = await this.getLatestTargetAnalytics(
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

  async listReleaseGroups(
    query: ReleaseGroupListQuery,
  ): Promise<IReleaseGroup[]> {
    const targetRows = await this.prisma.post.groupBy({
      by: ['groupId'],
      where: {
        ...(query.brandId ? { brandId: query.brandId } : {}),
        groupId: { not: null },
        isDeleted: false,
        organizationId: query.organizationId,
        parentId: null,
        scheduledDate: {
          gte: query.startDate,
          lte: query.endDate,
        },
      },
    });
    const targetGroupIds = [
      ...new Set(
        targetRows.flatMap((target) =>
          target.groupId ? [target.groupId] : [],
        ),
      ),
    ];

    const scheduleFilters: Prisma.PostGroupWhereInput[] = [
      {
        scheduledAt: {
          gte: query.startDate,
          lte: query.endDate,
        },
      },
    ];
    if (targetGroupIds.length > 0) {
      scheduleFilters.push({ id: { in: targetGroupIds } });
    }

    const groups = (await this.prisma.postGroup.findMany({
      orderBy: { id: 'asc' },
      where: {
        ...(query.brandId ? { brandId: query.brandId } : {}),
        isDeleted: false,
        organizationId: query.organizationId,
        OR: scheduleFilters,
        ...(query.statuses?.length ? { status: { in: query.statuses } } : {}),
      },
    })) as SchedulerPostGroup[];

    if (groups.length === 0) {
      return [];
    }

    const groupIds = groups.map((group) => group.id);
    const targets = (await this.prisma.post.findMany({
      orderBy: [
        { groupId: 'asc' },
        { order: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      where: {
        groupId: { in: groupIds },
        isDeleted: false,
        organizationId: query.organizationId,
        parentId: null,
      },
    })) as SchedulerPostTarget[];
    const targetsByGroup = new Map<string, SchedulerPostTarget[]>();
    for (const target of targets) {
      if (!target.groupId) {
        continue;
      }
      const currentTargets = targetsByGroup.get(target.groupId) ?? [];
      currentTargets.push(target);
      targetsByGroup.set(target.groupId, currentTargets);
    }
    const analyticsByTarget = await this.getLatestTargetAnalytics(
      this.prisma,
      query.organizationId,
      targets,
    );

    return groups
      .map((group) =>
        this.contractService.toReleaseGroup(
          group,
          targetsByGroup.get(group.id) ?? [],
          analyticsByTarget,
        ),
      )
      .sort((left, right) => {
        const scheduleOrder =
          this.getEarliestSchedule(left) - this.getEarliestSchedule(right);
        return scheduleOrder || left.id.localeCompare(right.id);
      });
  }

  async resolveCredentials(
    tx: Pick<SchedulerTx, 'credential'>,
    organizationId: string,
    targets: readonly ChannelTargetInput[],
  ): Promise<Map<string, SchedulerCredential>> {
    const ids = [...new Set(targets.map((target) => target.credentialId))];
    const credentials = (await tx.credential.findMany({
      select: {
        brandId: true,
        id: true,
        isConnected: true,
        organizationId: true,
        platform: true,
      },
      where: {
        id: { in: ids },
        isDeleted: false,
        organizationId,
      },
    })) as SchedulerCredential[];
    const byId = new Map(
      credentials.map((credential) => [credential.id, credential]),
    );

    for (const target of targets) {
      const credential = byId.get(target.credentialId);
      if (!credential) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not connected to this organization.`,
        );
      }
      if (
        String(credential.platform).toLowerCase() !==
        String(target.platform).toLowerCase()
      ) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is for ${credential.platform}, not ${target.platform}.`,
        );
      }
      if (!credential.isConnected) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not connected.`,
        );
      }
    }

    return byId;
  }

  async resolveBrandId(
    tx: Pick<SchedulerTx, 'brand'>,
    organizationId: string,
    requestedBrandId: string | undefined,
    credentials: ReadonlyMap<string, SchedulerCredential>,
  ): Promise<string> {
    const brandId =
      requestedBrandId ??
      [...credentials.values()].find((credential) => credential.brandId)
        ?.brandId ??
      undefined;

    if (!brandId) {
      throw new BadRequestException(
        'brandId is required when scheduler credentials are not brand-scoped.',
      );
    }

    const brand = await tx.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new BadRequestException(
        `Brand ${brandId} is not available for this organization.`,
      );
    }

    for (const credential of credentials.values()) {
      if (credential.brandId && credential.brandId !== brandId) {
        throw new BadRequestException(
          `Credential ${credential.id} belongs to a different brand.`,
        );
      }
    }

    return brandId;
  }

  async createAttachmentPosts(
    tx: Pick<SchedulerTx, 'post'>,
    params: CreateAttachmentPostsParams,
  ): Promise<void> {
    const attachments = [
      ...(params.input.attachments ?? []).filter(
        (attachment) =>
          !attachment.platform ||
          attachment.platform === params.target.platform,
      ),
      ...(params.target.attachments ?? []),
    ].filter(
      (attachment) =>
        attachment.kind === ReleaseAttachmentKind.COMMENT ||
        attachment.kind === ReleaseAttachmentKind.THREAD,
    );

    for (const [index, attachment] of attachments.entries()) {
      await tx.post.create({
        data: {
          brandId: params.brandId,
          credentialId: params.target.credentialId,
          description: attachment.body,
          groupId: params.group.id,
          label: `${params.group.title} ${attachment.kind}`,
          order: attachment.order ?? index,
          organizationId: params.group.organizationId,
          parentId: params.parent.id,
          platform: params.target.platform,
          scheduledDate: params.parent.scheduledDate,
          status: params.parent.targetExecutionState,
          targetExecutionState: params.parent.targetExecutionState,
          timezone: params.parent.timezone,
          userId: params.userId,
        },
      });
    }
  }

  async getGroupOrThrow(
    client: Pick<SchedulerTx, 'postGroup'>,
    organizationId: string,
    groupId: string,
  ): Promise<SchedulerPostGroup> {
    const group = (await client.postGroup.findFirst({
      where: { id: groupId, isDeleted: false, organizationId },
    })) as SchedulerPostGroup | null;

    if (!group) {
      throw new NotFoundException('PostGroup', groupId);
    }

    return group;
  }

  async getTargetOrThrow(
    client: Pick<SchedulerTx, 'post'>,
    organizationId: string,
    groupId: string,
    targetId: string,
  ): Promise<SchedulerPostTarget> {
    const target = (await client.post.findFirst({
      where: {
        groupId,
        id: targetId,
        isDeleted: false,
        organizationId,
      },
    })) as SchedulerPostTarget | null;

    if (!target) {
      throw new NotFoundException('ChannelTarget', targetId);
    }

    return target;
  }

  async getTargets(
    client: Pick<SchedulerTx, 'post'>,
    organizationId: string,
    groupId: string,
  ): Promise<SchedulerPostTarget[]> {
    return (await client.post.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      where: {
        groupId,
        isDeleted: false,
        organizationId,
        parentId: null,
      },
    })) as SchedulerPostTarget[];
  }

  async getLatestTargetAnalytics(
    client: Pick<SchedulerTx, '$queryRaw'>,
    organizationId: string,
    targets: readonly SchedulerPostTarget[],
  ): Promise<Map<string, SchedulerPostAnalytics>> {
    const targetIds = [...new Set(targets.map((target) => target.id))];
    const brandIds = [
      ...new Set(
        targets.flatMap((target) => (target.brandId ? [target.brandId] : [])),
      ),
    ];
    const platforms = [
      ...new Set(targets.map((target) => target.platform.toUpperCase())),
    ];
    if (
      targetIds.length === 0 ||
      brandIds.length === 0 ||
      platforms.length === 0
    ) {
      return new Map();
    }

    const rows = await client.$queryRaw<SchedulerPostAnalytics[]>(Prisma.sql`
      SELECT DISTINCT ON ("postId")
        "brandId",
        "date",
        "engagementRate",
        "id",
        "organizationId",
        "platform"::text AS "platform",
        "postId",
        "totalComments",
        "totalLikes",
        "totalSaves",
        "totalShares",
        "totalViews",
        "updatedAt"
      FROM "post_analytics"
      WHERE "organizationId" = ${organizationId}
        AND "brandId" IN (${Prisma.join(brandIds)})
        AND "postId" IN (${Prisma.join(targetIds)})
        AND "platform"::text IN (${Prisma.join(platforms)})
      ORDER BY "postId", "date" DESC, "updatedAt" DESC, "id"
    `);
    const targetsById = new Map(targets.map((target) => [target.id, target]));
    const analyticsByTarget = new Map<string, SchedulerPostAnalytics>();

    for (const row of rows) {
      const target = targetsById.get(row.postId);
      if (
        !target ||
        row.organizationId !== organizationId ||
        row.brandId !== target.brandId ||
        row.platform.toLowerCase() !== target.platform.toLowerCase()
      ) {
        continue;
      }
      analyticsByTarget.set(row.postId, row);
    }

    return analyticsByTarget;
  }

  private getEarliestSchedule(release: IReleaseGroup): number {
    const schedules = [
      release.scheduledAt,
      ...(release.targets ?? []).map((target) => target.scheduledAt),
    ]
      .filter((scheduledAt): scheduledAt is string => Boolean(scheduledAt))
      .map((scheduledAt) => Date.parse(scheduledAt))
      .filter(Number.isFinite);

    return schedules.length > 0 ? Math.min(...schedules) : Number.MAX_VALUE;
  }

  async recalculateAndHydrate(
    tx: Pick<SchedulerTx, '$queryRaw' | 'post' | 'postGroup'>,
    organizationId: string,
    groupId: string,
    userId: string,
  ): Promise<IReleaseGroup> {
    const group = await this.getGroupOrThrow(tx, organizationId, groupId);
    const targets = await this.getTargets(tx, organizationId, group.id);
    const analyticsByTarget = await this.getLatestTargetAnalytics(
      tx,
      organizationId,
      targets,
    );
    const status = deriveReleaseStatusFromTargets(
      targets.map(
        (target) => target.targetExecutionState as TargetExecutionState,
      ),
    );
    const transitions =
      status !== group.status
        ? this.contractService.appendTransition(
            group.statusTransitions,
            group.status,
            status,
            userId,
          )
        : undefined;

    const updated = (await tx.postGroup.update({
      data: {
        status,
        ...(transitions !== undefined && { statusTransitions: transitions }),
      },
      where: { id: group.id },
    })) as SchedulerPostGroup;

    return this.contractService.toReleaseGroup(
      updated,
      targets,
      analyticsByTarget,
    );
  }
}
