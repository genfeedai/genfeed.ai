import { summarizeMcpApproval } from '@api/collections/mcp-approvals/utils/mcp-approval-summary.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createMessagesConversationRoute,
  createOrganizationAppRoute,
  createPublishingApprovalsRoute,
} from '@genfeedai/contracts/constants';
import {
  BREAKOUT_REMIX_NOTIFICATION_TOPIC,
  buildReviewInboxItemId,
  getActivityAlertPolicy,
  type INotificationInboxActivity,
  type INotificationInboxItem,
  SOCIAL_REPLY_NOTIFICATION_TOPIC,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus, type Prisma } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const PAGE_LIMIT = 30;
/** The `NotificationEvent.sourceType` of an MCP tool approval request. */
const MCP_APPROVAL_SOURCE_TYPE = 'mcp_approval';
/** Unread approval alerts checked for settlement per inbox read. */
const SETTLE_APPROVAL_LIMIT = 200;

function parseInboxCursor(
  cursor?: string,
): Prisma.NotificationInboxItemWhereInput {
  let boundary: Prisma.NotificationInboxItemWhereInput = {};
  if (cursor) {
    if (typeof cursor !== 'string' || cursor.length > 400)
      throw new BadRequestException('Invalid inbox cursor');
    const [date, id, extra] = cursor.split('|');
    const occurredAt = new Date(date);
    if (
      extra !== undefined ||
      !id ||
      id.length > 200 ||
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.toISOString() !== date
    )
      throw new BadRequestException('Invalid inbox cursor');
    boundary = {
      OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: id } }],
    };
  }
  return boundary;
}

function readInboxFailure(
  topic: string,
  payload: Prisma.JsonValue,
): INotificationInboxItem['failure'] {
  const failure =
    topic === 'agent.status' &&
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
      ? payload.failure
      : null;
  const safeFailure =
    failure &&
    typeof failure === 'object' &&
    !Array.isArray(failure) &&
    typeof failure.title === 'string' &&
    typeof failure.summary === 'string' &&
    (failure.recovery === null || typeof failure.recovery === 'string')
      ? {
          title: failure.title.slice(0, 300),
          summary: failure.summary.slice(0, 1000),
          recovery:
            typeof failure.recovery === 'string'
              ? failure.recovery.slice(0, 1000)
              : null,
        }
      : null;
  return safeFailure;
}

type InboxActivityRow = {
  action: string | null;
  brandId: string | null;
  createdAt: Date;
  data: Prisma.JsonValue;
  entityId: string | null;
  entityModel: string | null;
  id: string;
  isDeleted: boolean;
  organizationId: string | null;
};

function readInboxActivity(
  organizationId: string,
  activity: InboxActivityRow | null,
): INotificationInboxActivity | null {
  if (
    !activity ||
    activity.isDeleted ||
    activity.organizationId !== organizationId
  ) {
    return null;
  }
  const data =
    activity.data &&
    typeof activity.data === 'object' &&
    !Array.isArray(activity.data)
      ? activity.data
      : {};
  const key =
    typeof data.key === 'string' && data.key ? data.key : activity.action;
  if (!key) return null;
  return {
    brandId: activity.brandId,
    createdAt: activity.createdAt.toISOString(),
    entityId: activity.entityId,
    entityModel: activity.entityModel,
    id: activity.id,
    key,
    source: typeof data.source === 'string' ? data.source : null,
    value: typeof data.value === 'string' ? data.value.slice(0, 4000) : null,
  };
}

/** Alerts that are not problems render as completed; the rest as failures. */
function readInboxOutcome(eventKey: string): 'completed' | 'failed' {
  const severity = getActivityAlertPolicy(eventKey)?.severity;
  return severity === 'success' || severity === 'info' ? 'completed' : 'failed';
}

function hasSystemWorkflowMetadata(metadata: Prisma.JsonValue): boolean {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      metadata[SYSTEM_WORKFLOW_METADATA_KEY],
  );
}

function inboxSourceHref(
  organizationSlug: string | null | undefined,
  brandSlug: string | null | undefined,
  path: string,
): string | null {
  const org = organizationSlug ?? '';
  if (org.length === 0) {
    return null;
  }
  const slug = brandSlug ?? '';
  if (slug.length > 0) {
    return createBrandAppRoute(org, slug, path);
  }
  return createOrganizationAppRoute(org, path);
}

type SocialReplyInboxPayload = {
  accountHandle: string | null;
  brandId: string;
  /** Conversation holding the newest reply: the item's link target. */
  newestConversationId: string;
  replyCount: number;
};

function readSocialReplyPayload(
  topic: string,
  payload: Prisma.JsonValue,
): SocialReplyInboxPayload | null {
  if (
    topic !== SOCIAL_REPLY_NOTIFICATION_TOPIC ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.kind !== 'social_reply' ||
    payload.version !== 2 ||
    typeof payload.brandId !== 'string' ||
    typeof payload.newestConversationId !== 'string' ||
    payload.newestConversationId.length === 0 ||
    payload.newestConversationId.length > 200 ||
    typeof payload.replyCount !== 'number' ||
    !Number.isInteger(payload.replyCount) ||
    payload.replyCount < 1
  ) {
    return null;
  }
  return {
    accountHandle:
      typeof payload.accountHandle === 'string' && payload.accountHandle
        ? payload.accountHandle.slice(0, 280)
        : null,
    brandId: payload.brandId,
    newestConversationId: payload.newestConversationId,
    replyCount: payload.replyCount,
  };
}

type BreakoutRemixInboxPayload = {
  brandId: string;
  /** Query that opens the remix for the post the offer is about. */
  remixQuery: string;
};

function readBreakoutRemixPayload(
  topic: string,
  payload: Prisma.JsonValue,
): BreakoutRemixInboxPayload | null {
  if (
    topic !== BREAKOUT_REMIX_NOTIFICATION_TOPIC ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.kind !== 'breakout_remix_offer' ||
    payload.version !== 1 ||
    typeof payload.brandId !== 'string'
  ) {
    return null;
  }
  const postId = typeof payload.postId === 'string' ? payload.postId : null;
  const sourcePostId =
    typeof payload.sourcePostId === 'string' ? payload.sourcePostId : null;
  const remixQuery = postId
    ? `remixPostId=${encodeURIComponent(postId.slice(0, 200))}`
    : sourcePostId
      ? `remixSourcePostId=${encodeURIComponent(sourcePostId.slice(0, 200))}`
      : null;
  return remixQuery ? { brandId: payload.brandId, remixQuery } : null;
}

function breakoutRemixInboxItem<
  A,
  R extends {
    event: { eventKey: string };
    id: string;
    occurredAt: Date;
    readAt: Date | null;
    topic: string;
  },
>(input: {
  activity: A;
  brandSlug: string | undefined;
  orgSlug: string;
  remix: BreakoutRemixInboxPayload;
  row: R;
}) {
  const { activity, brandSlug, orgSlug, remix, row } = input;
  return {
    id: row.id,
    topic: row.topic,
    occurredAt: row.occurredAt,
    readAt: row.readAt,
    outcome: 'completed' as const,
    severity: getActivityAlertPolicy(row.event.eventKey)?.severity ?? null,
    activity,
    sourceHref: brandSlug
      ? inboxSourceHref(
          orgSlug,
          brandSlug,
          `${APP_ROUTES.ANALYTICS.POSTS}?${remix.remixQuery}`,
        )
      : null,
    sourceLabel: null,
    failure: null,
  };
}

/**
 * Slugs for the given brands, limited to brands the member may open.
 * A brand outside that set is simply missing from the map.
 */
async function loadVisibleBrandSlugs(input: {
  brandIds: string[];
  member: { brands: Array<{ id: string }>; role: { key: string } };
  organizationId: string;
  prisma: PrismaService;
}): Promise<Map<string, string>> {
  const { member, organizationId, prisma } = input;
  const brandIds = [...new Set(input.brandIds)];
  if (brandIds.length === 0) {
    return new Map();
  }
  const isAdmin =
    member.role.key === MemberRole.OWNER ||
    member.role.key === MemberRole.ADMIN;
  const assigned = member.brands.map((brand) => brand.id);
  const visibleIds =
    !isAdmin && assigned.length > 0
      ? brandIds.filter((id) => assigned.includes(id))
      : brandIds;
  if (visibleIds.length === 0) {
    return new Map();
  }
  const brands = await prisma.brand.findMany({
    where: scopedWhere(organizationId, { id: { in: visibleIds } }),
    select: { id: true, slug: true },
  });
  return new Map(
    brands.flatMap((brand) => (brand.slug ? [[brand.id, brand.slug]] : [])),
  );
}

/**
 * Brand slugs for `social.reply` and breakout-offer rows, limited to brands the
 * member may open.
 * A brand outside that set still lists the item, just without a link.
 */
async function loadInboxBrandSlugs(input: {
  member: { brands: Array<{ id: string }>; role: { key: string } };
  organizationId: string;
  page: Array<{ event: { payload: Prisma.JsonValue }; topic: string }>;
  prisma: PrismaService;
}): Promise<Map<string, string>> {
  const { member, organizationId, page, prisma } = input;
  const brandIds = page.flatMap((row) => {
    const payload =
      readSocialReplyPayload(row.topic, row.event.payload) ??
      readBreakoutRemixPayload(row.topic, row.event.payload);
    return payload ? [payload.brandId] : [];
  });
  return loadVisibleBrandSlugs({ brandIds, member, organizationId, prisma });
}

type McpApprovalInboxEntry = {
  brandId: string | null;
  /** Slug of the approval's brand, when the member may open that brand. */
  brandSlug: string | undefined;
  isPending: boolean;
  summary: string;
};

/**
 * What each MCP approval alert on the page is about: the approval's one-line
 * summary, whether it still waits on a decision, and the brand it was issued
 * for. An approval that is gone from the page's map renders as unavailable.
 */
async function loadMcpApprovalEntries(input: {
  member: { brands: Array<{ id: string }>; role: { key: string } };
  organizationId: string;
  page: Array<{ event: { sourceId: string; sourceType: string } }>;
  prisma: PrismaService;
  userId: string;
}): Promise<Map<string, McpApprovalInboxEntry>> {
  const { member, organizationId, page, prisma, userId } = input;
  const ids = [
    ...new Set(
      page
        .filter((row) => row.event.sourceType === MCP_APPROVAL_SOURCE_TYPE)
        .map((row) => row.event.sourceId),
    ),
  ];
  if (ids.length === 0) {
    return new Map();
  }
  const approvals = await prisma.mcpApproval.findMany({
    where: scopedWhere(organizationId, { id: { in: ids }, userId }),
    select: { arguments: true, id: true, status: true, toolName: true },
  });
  const entries = approvals.map((approval) => {
    const args = isRecord(approval.arguments) ? approval.arguments : {};
    return {
      brandId: typeof args.brandId === 'string' ? args.brandId : null,
      id: approval.id,
      isPending: approval.status === McpApprovalStatus.PENDING,
      summary: summarizeMcpApproval(approval.toolName, args).slice(0, 300),
    };
  });
  const brandSlugs = await loadVisibleBrandSlugs({
    brandIds: entries.flatMap((entry) =>
      entry.brandId ? [entry.brandId] : [],
    ),
    member,
    organizationId,
    prisma,
  });
  return new Map(
    entries.map(({ id, ...entry }) => [
      id,
      {
        ...entry,
        brandSlug: entry.brandId ? brandSlugs.get(entry.brandId) : undefined,
      },
    ]),
  );
}

/**
 * The bell row for an MCP approval alert. An approval with a brand opens in
 * that brand's queue, one without in the organization's; a decided approval or
 * a brand the member cannot open leaves no link.
 */
function mcpApprovalInboxItem<
  A,
  R extends {
    event: { eventKey: string; sourceId: string };
    id: string;
    occurredAt: Date;
    readAt: Date | null;
    topic: string;
  },
>(input: {
  activity: (A & { value: string | null }) | null;
  approval: McpApprovalInboxEntry | undefined;
  orgSlug: string;
  row: R;
}) {
  const { activity, approval, orgSlug, row } = input;
  const canLink = Boolean(
    approval?.isPending && (!approval.brandId || approval.brandSlug),
  );
  return {
    id: row.id,
    topic: row.topic,
    occurredAt: row.occurredAt,
    readAt: row.readAt,
    outcome: readInboxOutcome(row.event.eventKey),
    severity: getActivityAlertPolicy(row.event.eventKey)?.severity ?? null,
    activity:
      activity && approval
        ? { ...activity, value: approval.summary }
        : activity,
    sourceHref: canLink
      ? inboxSourceHref(
          orgSlug,
          approval?.brandSlug,
          createPublishingApprovalsRoute({
            approval: buildReviewInboxItemId({
              approvalId: row.event.sourceId,
              kind: 'mcp_approval',
            }),
          }),
        )
      : null,
    sourceLabel: approval?.summary ?? null,
    failure: null,
  };
}

/** The bell row for a `social.reply` alert; it links to the newest reply. */
function socialReplyInboxItem<
  A,
  R extends {
    event: { eventKey: string };
    id: string;
    occurredAt: Date;
    readAt: Date | null;
    topic: string;
  },
>(input: {
  activity: A;
  brandSlug: string | undefined;
  orgSlug: string;
  row: R;
  socialReply: SocialReplyInboxPayload;
}) {
  const { activity, brandSlug, orgSlug, row, socialReply } = input;
  return {
    id: row.id,
    topic: row.topic,
    occurredAt: row.occurredAt,
    readAt: row.readAt,
    outcome: 'completed' as const,
    severity: getActivityAlertPolicy(row.event.eventKey)?.severity ?? null,
    activity,
    sourceHref: brandSlug
      ? inboxSourceHref(
          orgSlug,
          brandSlug,
          createMessagesConversationRoute(socialReply.newestConversationId),
        )
      : null,
    sourceLabel: null,
    failure: null,
    socialReply: {
      accountHandle: socialReply.accountHandle,
      replyCount: socialReply.replyCount,
    },
  };
}

@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(
    organizationId: string,
    userId: string,
  ): Prisma.NotificationInboxItemWhereInput {
    return {
      organizationId,
      userId,
      isDeleted: false,
      event: { organizationId, isDeleted: false },
      user: { is: { isDeleted: false } },
      organization: {
        isDeleted: false,
        members: {
          some: { organizationId, userId, isActive: true, isDeleted: false },
        },
      },
    };
  }

  private async member(organizationId: string, userId: string) {
    if (!organizationId || !userId)
      throw new ForbiddenException('Active membership required');
    const member = await this.prisma.member.findFirst({
      where: {
        organizationId,
        userId,
        isActive: true,
        isDeleted: false,
        user: { is: { isDeleted: false } },
        organization: { is: { isDeleted: false } },
      },
      select: {
        role: { select: { key: true } },
        brands: {
          where: { organizationId, isDeleted: false },
          select: { id: true },
        },
        organization: { select: { slug: true } },
      },
    });
    if (!member) throw new ForbiddenException('Active membership required');
    return member;
  }

  /**
   * An approval alert asks for a decision, so once the approval is decided,
   * superseded or gone the alert has nothing left to ask: mark it read instead
   * of leaving it unread in the bell.
   */
  private async settleResolvedApprovalAlerts(
    organizationId: string,
    userId: string,
  ) {
    const unread = await this.prisma.notificationInboxItem.findMany({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        readAt: null,
        event: {
          organizationId,
          isDeleted: false,
          sourceType: MCP_APPROVAL_SOURCE_TYPE,
        },
      }),
      select: {
        event: { select: { sourceId: true, sourceType: true } },
        id: true,
      },
      take: SETTLE_APPROVAL_LIMIT,
    });
    const candidates = unread.filter(
      (item) => item.event.sourceType === MCP_APPROVAL_SOURCE_TYPE,
    );
    if (candidates.length === 0) {
      return;
    }
    const pending = await this.prisma.mcpApproval.findMany({
      where: scopedWhere(organizationId, {
        id: { in: candidates.map((item) => item.event.sourceId) },
        status: McpApprovalStatus.PENDING,
      }),
      select: { id: true },
    });
    const pendingIds = new Set(pending.map((approval) => approval.id));
    const settledIds = candidates
      .filter((item) => !pendingIds.has(item.event.sourceId))
      .map((item) => item.id);
    if (settledIds.length === 0) {
      return;
    }
    await this.prisma.notificationInboxItem.updateMany({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        readAt: null,
        id: { in: settledIds },
      }),
      data: { readAt: new Date() },
    });
  }

  async count(organizationId: string, userId: string) {
    await this.member(organizationId, userId);
    await this.settleResolvedApprovalAlerts(organizationId, userId);
    const unreadCount = await this.prisma.notificationInboxItem.count({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        readAt: null,
      }),
    });
    return { id: organizationId, unreadCount };
  }

  async markRead(organizationId: string, userId: string, ids: string[] | null) {
    await this.member(organizationId, userId);
    if (
      ids &&
      (ids.length === 0 ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || id.length > 200))
    )
      throw new BadRequestException('Expected 1 to 100 notification IDs');
    await this.prisma.notificationInboxItem.updateMany({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        readAt: null,
        ...(ids ? { id: { in: ids } } : {}),
      }),
      data: { readAt: new Date() },
    });
    return this.count(organizationId, userId);
  }

  async list(organizationId: string, userId: string, cursor?: string) {
    const member = await this.member(organizationId, userId);
    await this.settleResolvedApprovalAlerts(organizationId, userId);
    const rows = await this.prisma.notificationInboxItem.findMany({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        ...parseInboxCursor(cursor),
      }),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: PAGE_LIMIT + 1,
      include: {
        activity: {
          select: {
            action: true,
            brandId: true,
            createdAt: true,
            data: true,
            entityId: true,
            entityModel: true,
            id: true,
            isDeleted: true,
            organizationId: true,
          },
        },
        event: true,
      },
    });
    const page = rows.slice(0, PAGE_LIMIT);
    const {
      accessibleStrategies,
      sources,
      strategyIdFor: strategyIdFromPayload,
      threads,
    } = await loadInboxAssociations({
      member,
      organizationId,
      page,
      prisma: this.prisma,
      userId,
    });

    const inboxBrandSlugs = await loadInboxBrandSlugs({
      member,
      organizationId,
      page,
      prisma: this.prisma,
    });

    const mcpApprovals = await loadMcpApprovalEntries({
      member,
      organizationId,
      page,
      prisma: this.prisma,
      userId,
    });

    const docs = page.map((row) => {
      if (row.event.sourceType === MCP_APPROVAL_SOURCE_TYPE) {
        return mcpApprovalInboxItem({
          activity: readInboxActivity(organizationId, row.activity),
          approval: mcpApprovals.get(row.event.sourceId),
          orgSlug: member.organization.slug,
          row,
        });
      }
      const socialReply = readSocialReplyPayload(row.topic, row.event.payload);
      if (socialReply) {
        return socialReplyInboxItem({
          activity: readInboxActivity(organizationId, row.activity),
          brandSlug: inboxBrandSlugs.get(socialReply.brandId),
          orgSlug: member.organization.slug,
          row,
          socialReply,
        });
      }
      const breakoutRemix = readBreakoutRemixPayload(
        row.topic,
        row.event.payload,
      );
      if (breakoutRemix) {
        return breakoutRemixInboxItem({
          activity: readInboxActivity(organizationId, row.activity),
          brandSlug: inboxBrandSlugs.get(breakoutRemix.brandId),
          orgSlug: member.organization.slug,
          remix: breakoutRemix,
          row,
        });
      }
      const source = sources.get(row.event.sourceId);
      const thread = threads.get(row.event.sourceId);
      const strategyId = thread?.agentStrategyId ?? strategyIdFromPayload(row);
      const strategy = strategyId
        ? accessibleStrategies.get(strategyId)
        : undefined;
      const ingredient = source?.ingredients?.[0];
      const isVisibleWorkflow =
        Boolean(source?.workflow.brand) &&
        !hasSystemWorkflowMetadata(source?.workflow.metadata ?? null);
      const path = strategy
        ? `${APP_ROUTES.AUTOMATION.AGENTS}/${encodeURIComponent(strategy.id)}`
        : ingredient
          ? createLibraryAssetRoute(ingredient.category, ingredient.id)
          : thread
            ? `${APP_ROUTES.AGENT.ROOT}/${encodeURIComponent(thread.id)}`
            : isVisibleWorkflow && source
              ? `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${encodeURIComponent(source.workflowId)}?execution=${encodeURIComponent(source.id)}`
              : APP_ROUTES.WORKSPACE.ACTIVITY;
      const brandSlug = strategy
        ? strategy.brand?.slug
        : (ingredient?.brand?.slug ??
          thread?.brand?.slug ??
          source?.workflow.brand?.slug);
      return {
        id: row.id,
        topic: row.topic,
        occurredAt: row.occurredAt,
        readAt: row.readAt,
        outcome: readInboxOutcome(row.event.eventKey),
        severity: getActivityAlertPolicy(row.event.eventKey)?.severity ?? null,
        activity: readInboxActivity(organizationId, row.activity),
        sourceHref: inboxSourceHref(member.organization.slug, brandSlug, path),
        sourceLabel:
          strategy?.label?.slice(0, 300) ??
          thread?.title?.slice(0, 300) ??
          (isVisibleWorkflow
            ? (source?.workflow.label?.slice(0, 300) ?? null)
            : null),
        failure: readInboxFailure(row.topic, row.event.payload),
      };
    });
    const last = page.at(-1);
    const hasMore = rows.length > PAGE_LIMIT;
    return {
      docs,
      hasMore,
      limit: PAGE_LIMIT,
      nextCursor:
        hasMore && last ? `${last.occurredAt.toISOString()}|${last.id}` : null,
    };
  }
}

async function loadInboxAssociations<
  T extends {
    event: {
      payload: Prisma.JsonValue;
      sourceId: string;
      sourceType: string;
    };
    topic: string;
  },
>(input: {
  member: {
    brands: Array<{ id: string }>;
    role: { key: string };
  };
  organizationId: string;
  page: T[];
  prisma: PrismaService;
  userId: string;
}) {
  const { member, organizationId, page, prisma, userId } = input;
  const isAdmin =
    member.role.key === MemberRole.OWNER ||
    member.role.key === MemberRole.ADMIN;
  const restrictToAssignedBrands = !isAdmin && member.brands.length > 0;
  const sourceAccessWhere = {
    organizationId,
    isDeleted: false,
    userId,
    OR: [
      { brandId: null },
      {
        brand: {
          is: {
            organizationId,
            isDeleted: false,
            ...(restrictToAssignedBrands
              ? { id: { in: member.brands.map((brand) => brand.id) } }
              : {}),
          },
        },
      },
    ],
  } satisfies Prisma.WorkflowWhereInput & Prisma.AgentThreadWhereInput;
  const runIds = [
    ...new Set(
      page
        .filter((row) =>
          ['agent_run', 'workflow_execution'].includes(row.event.sourceType),
        )
        .map((row) => row.event.sourceId),
    ),
  ];
  const executions = await prisma.workflowExecution.findMany({
    where: {
      organizationId,
      isDeleted: false,
      id: { in: runIds },
      OR: [
        { userId },
        {
          workflow: {
            is: { userId, organizationId, isDeleted: false },
          },
        },
      ],
      workflow: {
        is: {
          organizationId,
          isDeleted: false,
          OR: sourceAccessWhere.OR,
        },
      },
    },
    select: {
      id: true,
      workflowId: true,
      workflow: {
        select: {
          label: true,
          metadata: true,
          brand: { select: { slug: true } },
        },
      },
      ingredients: {
        where: {
          organizationId,
          isDeleted: false,
          ...(restrictToAssignedBrands
            ? {
                OR: [
                  { brandId: null },
                  {
                    brandId: {
                      in: member.brands.map((brand) => brand.id),
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          category: true,
          brand: { select: { slug: true } },
        },
        take: 1,
      },
    },
  });
  const sources = new Map(executions.map((source) => [source.id, source]));
  const threadEvents = await prisma.agentThreadEvent.findMany({
    where: {
      organizationId,
      isDeleted: false,
      runId: { in: runIds },
      thread: { is: sourceAccessWhere },
    },
    select: {
      runId: true,
      thread: {
        select: {
          id: true,
          title: true,
          agentStrategyId: true,
          brand: { select: { slug: true } },
        },
      },
    },
    orderBy: { sequence: 'desc' },
  });
  const threads = new Map<string, (typeof threadEvents)[number]['thread']>();
  for (const event of threadEvents) {
    const runId = event.runId;
    if (!runId || threads.has(runId)) {
      continue;
    }
    threads.set(runId, event.thread);
  }

  const strategyIdFromPayload = (
    row: (typeof page)[number],
  ): string | undefined => {
    const payload = row.event.payload;
    return row.topic === 'agent.status' &&
      ['agent_run', 'agent_strategy'].includes(row.event.sourceType) &&
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.strategyId === 'string' &&
      (row.event.sourceType !== 'agent_strategy' ||
        payload.strategyId === row.event.sourceId)
      ? payload.strategyId
      : undefined;
  };
  const strategyIds = [
    ...new Set(
      [
        ...page.map(strategyIdFromPayload),
        ...[...threads.values()].map((thread) => thread.agentStrategyId),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const reviewStrategyIds = page
    .filter(
      (row) =>
        row.topic === 'agent.status' &&
        row.event.sourceType === 'agent_strategy',
    )
    .map(strategyIdFromPayload)
    .filter((id): id is string => Boolean(id));
  const strategies = strategyIds.length
    ? await prisma.agentStrategy.findMany({
        where: {
          ...sourceAccessWhere,
          userId: undefined,
          id: { in: strategyIds },
          AND: [{ OR: [{ userId }, { id: { in: reviewStrategyIds } }] }],
        },
        select: { id: true, label: true, brand: { select: { slug: true } } },
      })
    : [];
  const accessibleStrategies = new Map(
    strategies.map((strategy) => [strategy.id, strategy]),
  );
  return {
    accessibleStrategies,
    sources,
    strategyIdFor: strategyIdFromPayload,
    threads,
  };
}
