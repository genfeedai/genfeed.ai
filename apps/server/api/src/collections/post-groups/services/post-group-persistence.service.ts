import type {
  CreateAttachmentPostsParams,
  CreatePostGroupParams,
  ReleaseGroupListQuery,
  ReleaseGroupListResult,
  SchedulerCredential,
  SchedulerPostAnalytics,
  SchedulerPostGroup,
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import {
  compareReleaseProjections,
  matchesReleaseListQuery,
  toSyntheticReleaseGroup,
} from '@api/collections/post-groups/services/post-group-release-projection.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ReleaseAttachmentKind, ReleaseStatus } from '@genfeedai/contracts';
import type { ChannelTargetValidationResult } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type { ChannelTargetInput } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  IPublishingProviderReadiness,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

type ReleaseProjectionRecord = {
  group: SchedulerPostGroup;
  release: IReleaseGroup;
  targets: SchedulerPostTarget[];
};

type ScheduleWindow = { gte: Date; lte: Date };

type CreatePostGroupTargetsContext = {
  brandId: string;
  credentials: ReadonlyMap<string, SchedulerCredential>;
  group: SchedulerPostGroup;
  readinessByCredential: ReadonlyMap<string, IPublishingProviderReadiness>;
  validations: readonly ChannelTargetValidationResult[];
};

type SchedulerPostTargetRow = Omit<
  SchedulerPostTarget,
  'credentialId' | 'platform'
> & {
  credentialId: string | null;
  platform: string | null;
};

function isSchedulerPostTarget(
  target: SchedulerPostTargetRow,
): target is SchedulerPostTarget {
  return Boolean(target.credentialId?.trim() && target.platform?.trim());
}

/** Exactly the columns the release projection consumes — nothing else. */
const SCHEDULER_POST_GROUP_SELECT = {
  attachments: true,
  baseContent: true,
  brandId: true,
  campaignId: true,
  createdAt: true,
  id: true,
  idempotencyKey: true,
  isDeleted: true,
  media: true,
  organizationId: true,
  ownerId: true,
  postingSetId: true,
  publishedAt: true,
  rssFeedItemId: true,
  rssSourceId: true,
  recurrence: true,
  scheduledAt: true,
  status: true,
  statusTransitions: true,
  timezone: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.PostGroupSelect;

/**
 * Exactly the `SchedulerPostTarget` columns; drops the heavy editorial and
 * review columns (`reviewEvents`, `seoBreakdown`, `promptUsed`, …) the
 * projection never reads.
 */
const SCHEDULER_POST_TARGET_SELECT = {
  agentContextSource: true,
  agentContextVersion: true,
  agentStrategyId: true,
  agentThreadId: true,
  analyticsCollectedAt: true,
  analyticsCollectionAttemptKey: true,
  analyticsCollectionError: true,
  analyticsCollectionRequestedAt: true,
  analyticsCollectionState: true,
  brandId: true,
  campaignId: true,
  category: true,
  createdAt: true,
  credentialId: true,
  description: true,
  externalId: true,
  externalShortcode: true,
  groupId: true,
  id: true,
  isDeleted: true,
  label: true,
  lastAttemptAt: true,
  order: true,
  organizationId: true,
  platform: true,
  publishApprovalId: true,
  publishedAt: true,
  retryCount: true,
  scheduledDate: true,
  status: true,
  targetAttachments: true,
  targetError: true,
  targetExecutionState: true,
  targetIdempotencyKey: true,
  targetReadiness: true,
  targetSettings: true,
  targetValidationIssues: true,
  targetValidationState: true,
  tags: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      backgroundColor: true,
      id: true,
      isDeleted: true,
      label: true,
      textColor: true,
    },
    where: { isDeleted: false },
  },
  timezone: true,
  updatedAt: true,
  url: true,
  userId: true,
  visibility: true,
  workflowExecutionId: true,
} satisfies Prisma.PostSelect;

@Injectable()
export class PostGroupPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: PostGroupContractService,
    private readonly readinessService: PostGroupReadinessService,
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
    if (params.input.campaignId) {
      await this.assertCampaignScope(
        tx,
        params.organizationId,
        params.input.campaignId,
        brandId,
      );
    }
    const isDraft = params.status === ReleaseStatus.DRAFT;
    const readinessByCredential =
      await this.readinessService.resolveForCredentials(
        tx,
        params.organizationId,
        params.input.targets.map((target) => target.credentialId),
      );
    const validations = params.input.targets.map((target) => {
      const validation = this.contractService.validateTarget(
        params.input,
        target,
        isDraft ? 'draft' : 'scheduled',
      );
      if (!validation.valid && !isDraft) {
        throw this.contractService.invalidTargetException(target, validation);
      }
      if (!isDraft) {
        this.readinessService.assertSchedulable(
          target,
          readinessByCredential.get(target.credentialId),
        );
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
        campaignId: params.input.campaignId ?? null,
        idempotencyKey: params.input.idempotencyKey ?? null,
        media: this.contractService.toJson(params.input.media ?? []),
        organizationId: params.organizationId,
        ownerId: params.userId,
        postingSetId: params.input.postingSetId ?? null,
        rssFeedItemId: params.input.rssFeedItemId ?? null,
        rssSourceId: params.input.rssSourceId ?? null,
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

    const targets = await this.createPostGroupTargets(tx, params, {
      brandId,
      credentials,
      group,
      readinessByCredential,
      validations,
    });

    return this.contractService.toReleaseGroup(group, targets);
  }

  async assertCampaignScope(
    tx: SchedulerTx,
    organizationId: string,
    campaignId: string,
    brandId: string | null,
  ): Promise<void> {
    if (!brandId) {
      throw new NotFoundException('Campaign', campaignId);
    }
    const campaign = await tx.campaign.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { brandId, id: campaignId }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', campaignId);
    }
  }

  private async createPostGroupTargets(
    tx: SchedulerTx,
    params: CreatePostGroupParams,
    context: CreatePostGroupTargetsContext,
  ): Promise<SchedulerPostTarget[]> {
    const targets: SchedulerPostTarget[] = [];
    for (const [index, target] of params.input.targets.entries()) {
      const credential = context.credentials.get(target.credentialId);
      if (!credential) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not available for this organization.`,
        );
      }

      const validation = context.validations[index];
      if (!validation) {
        throw new BadRequestException(
          'Missing channel target validation result.',
        );
      }

      const created = (await tx.post.create({
        data: {
          campaignId: context.group.campaignId,
          ...(params.provenance?.agentContextSource && {
            agentContextSource: params.provenance.agentContextSource,
          }),
          ...(params.provenance?.agentContextVersion !== undefined && {
            agentContextVersion: params.provenance.agentContextVersion,
          }),
          ...(params.provenance?.contentRunId && {
            contentRunId: params.provenance.contentRunId,
          }),
          ...(params.provenance?.workflowExecutionId && {
            workflowExecutionId: params.provenance.workflowExecutionId,
          }),
          ...(params.provenance?.agentStrategyId && {
            agentStrategyId: params.provenance.agentStrategyId,
          }),
          ...(params.provenance?.agentThreadId && {
            agentThreadId: params.provenance.agentThreadId,
          }),
          brandId: context.brandId,
          credentialId: target.credentialId,
          description: this.contractService.readTargetCaption(
            target.caption,
            params.input.baseContent,
          ),
          groupId: context.group.id,
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
            context.group.scheduledAt,
          targetAttachments: this.contractService.toJson(
            target.attachments ?? [],
          ),
          targetExecutionState: this.contractService.toTargetState(
            params.status,
          ),
          targetReadiness: this.contractService.toReadinessJson(
            context.readinessByCredential.get(target.credentialId) ??
              validation.readiness,
          ),
          targetSettings: this.contractService.toJson({
            ...(target.settings ?? {}),
            ...(params.input.postingSetId
              ? { postingSetId: params.input.postingSetId }
              : {}),
            ...(params.provenance?.autoPublishPolicyId
              ? { autoPublishPolicyId: params.provenance.autoPublishPolicyId }
              : {}),
            ...(params.provenance?.postingSetId
              ? { postingSetId: params.provenance.postingSetId }
              : {}),
          }),
          visibility: target.visibility,
          targetValidationIssues:
            this.contractService.validationIssues(validation),
          targetValidationState: validation.validationState,
          timezone: target.timezone ?? params.input.timezone,
          userId: params.userId,
        },
      })) as SchedulerPostTarget;

      await this.createAttachmentPosts(tx, {
        brandId: context.brandId,
        group: context.group,
        input: params.input,
        parent: created,
        target,
        userId: params.userId,
      });

      targets.push(created);
    }

    return targets;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<IReleaseGroup | undefined> {
    const group = (await this.prisma.postGroup.findFirst({
      where: scopedWhere(organizationId, { idempotencyKey }),
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
  ): Promise<ReleaseGroupListResult> {
    const brandFilter = query.brandId ? { brandId: query.brandId } : {};
    const campaignFilter = query.campaignId
      ? { campaignId: query.campaignId }
      : {};
    const window: ScheduleWindow | undefined =
      query.startDate && query.endDate
        ? { gte: query.startDate, lte: query.endDate }
        : undefined;

    // The schedule window is the only list filter expressible before the
    // release projection is derived (status, search, and target facets all
    // need the derived shape). When present, prefilter both hydration reads
    // with two id-only queries so a calendar page stops scanning the
    // organization's full posting history. `matchesReleaseListQuery` remains
    // the source of truth for every filter, including the window itself.
    const windowGroupIds = window
      ? await this.findGroupIdsInScheduleWindow(query, window)
      : undefined;

    const [groups, targetRows] = await Promise.all([
      this.prisma.postGroup.findMany({
        orderBy: { id: 'asc' },
        select: SCHEDULER_POST_GROUP_SELECT,
        where: scopedWhere(query.organizationId, {
          ...brandFilter,
          ...campaignFilter,
          ...(windowGroupIds ? { id: { in: windowGroupIds } } : {}),
        }),
      }) as Promise<SchedulerPostGroup[]>,
      this.prisma.post.findMany({
        orderBy: [
          { groupId: 'asc' },
          { order: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        select: SCHEDULER_POST_TARGET_SELECT,
        where: scopedWhere(query.organizationId, {
          ...brandFilter,
          credentialId: { not: null },
          parentId: null,
          platform: { not: null },
          ...(window && windowGroupIds
            ? {
                OR: [
                  { groupId: { in: windowGroupIds } },
                  { groupId: null, scheduledDate: window },
                ],
              }
            : {}),
        }),
      }) as Promise<SchedulerPostTargetRow[]>,
    ]);
    const targets = targetRows.filter(isSchedulerPostTarget);

    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const targetsByGroup = new Map<string, SchedulerPostTarget[]>();
    const projectionRecords: ReleaseProjectionRecord[] = [];

    for (const target of targets) {
      if (!target.groupId) {
        const syntheticGroup = toSyntheticReleaseGroup(
          target,
          query.organizationId,
        );
        if (syntheticGroup) {
          projectionRecords.push({
            group: syntheticGroup,
            release: this.contractService.toReleaseGroup(syntheticGroup, [
              target,
            ]),
            targets: [target],
          });
        }
        continue;
      }
      // A target that points at a deleted, unauthorized, or missing release is
      // not silently reclassified as legacy ungrouped content.
      if (!groupsById.has(target.groupId)) {
        continue;
      }
      const currentTargets = targetsByGroup.get(target.groupId) ?? [];
      currentTargets.push(target);
      targetsByGroup.set(target.groupId, currentTargets);
    }

    for (const group of groups) {
      const groupTargets = targetsByGroup.get(group.id) ?? [];
      if (groupTargets.length === 0) {
        continue;
      }
      projectionRecords.push({
        group,
        release: this.contractService.toReleaseGroup(group, groupTargets),
        targets: groupTargets,
      });
    }

    const matchingRecords = projectionRecords
      .filter((record) => matchesReleaseListQuery(record.release, query))
      .sort((left, right) =>
        compareReleaseProjections(left.release, right.release, query),
      );
    const totalDocs = matchingRecords.length;
    const isPaginated = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = isPaginated ? (query.limit ?? 20) : Math.max(1, totalDocs);
    const totalPages = isPaginated
      ? Math.max(1, Math.ceil(totalDocs / limit))
      : 1;
    const pageRecords = isPaginated
      ? matchingRecords.slice((page - 1) * limit, page * limit)
      : matchingRecords;
    const pageTargets = pageRecords.flatMap((record) => record.targets);
    const analyticsByTarget = await this.getLatestTargetAnalytics(
      this.prisma,
      query.organizationId,
      pageTargets,
    );
    const docs = pageRecords.map((record) =>
      this.contractService.toReleaseGroup(
        record.group,
        record.targets,
        analyticsByTarget,
      ),
    );

    return {
      docs,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
      nextPage: page < totalPages ? page + 1 : null,
      page,
      pagingCounter: (page - 1) * limit + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  /**
   * Ids of every release whose group-level schedule or at least one target
   * schedule intersects the window — the same membership rule
   * `matchesReleaseListQuery` applies to the derived projection.
   */
  private async findGroupIdsInScheduleWindow(
    query: ReleaseGroupListQuery,
    window: ScheduleWindow,
  ): Promise<string[]> {
    const brandFilter = query.brandId ? { brandId: query.brandId } : {};
    const [groupRows, targetRows] = await Promise.all([
      this.prisma.postGroup.findMany({
        select: { id: true },
        where: scopedWhere(query.organizationId, {
          ...brandFilter,
          scheduledAt: window,
        }),
      }),
      this.prisma.post.findMany({
        select: { groupId: true },
        where: scopedWhere(query.organizationId, {
          ...brandFilter,
          credentialId: { not: null },
          groupId: { not: null },
          parentId: null,
          platform: { not: null },
          scheduledDate: window,
        }),
      }),
    ]);

    return [
      ...new Set([
        ...groupRows.map((row) => row.id),
        ...targetRows
          .map((row) => row.groupId)
          .filter((id): id is string => id !== null),
      ]),
    ];
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
      where: scopedWhere(organizationId, { id: { in: ids } }),
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
      where: scopedWhere(organizationId, { id: brandId }),
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
          targetExecutionState: params.parent.targetExecutionState,
          visibility: params.parent.visibility,
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
      where: scopedWhere(organizationId, { id: groupId }),
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
      where: scopedWhere(organizationId, { groupId, id: targetId }),
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
    const rows = (await client.post.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: SCHEDULER_POST_TARGET_SELECT,
      where: scopedWhere(organizationId, {
        credentialId: { not: null },
        groupId,
        parentId: null,
        platform: { not: null },
      }),
    })) as SchedulerPostTargetRow[];

    return rows.filter(isSchedulerPostTarget);
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

    let rows: SchedulerPostAnalytics[];
    try {
      rows = await client.$queryRaw<SchedulerPostAnalytics[]>(Prisma.sql`
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
    } catch {
      return new Map();
    }
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

  async hydrateWithDerivedStatus(
    tx: Pick<SchedulerTx, '$queryRaw' | 'post' | 'postGroup'>,
    organizationId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const group = await this.getGroupOrThrow(tx, organizationId, groupId);
    const targets = await this.getTargets(tx, organizationId, group.id);
    const analyticsByTarget = await this.getLatestTargetAnalytics(
      tx,
      organizationId,
      targets,
    );
    return this.contractService.toReleaseGroup(
      group,
      targets,
      analyticsByTarget,
    );
  }
}
