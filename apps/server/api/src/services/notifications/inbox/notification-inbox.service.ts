import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import {
  type INotificationInboxItem,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const PAGE_LIMIT = 30;

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

function hasSystemWorkflowMetadata(metadata: Prisma.JsonValue): boolean {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      metadata[SYSTEM_WORKFLOW_METADATA_KEY],
  );
}

function inboxSourceHref(
  organizationSlug: string,
  brandSlug: string | undefined,
  path: string | null,
): string | null {
  if (!path) return null;
  return brandSlug
    ? createBrandAppRoute(organizationSlug, brandSlug, path)
    : createOrganizationAppRoute(organizationSlug, path);
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
      user: { isDeleted: false },
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
        user: { isDeleted: false },
        organization: { isDeleted: false },
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

  async count(organizationId: string, userId: string) {
    await this.member(organizationId, userId);
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
    const rows = await this.prisma.notificationInboxItem.findMany({
      where: scopedWhere(organizationId, {
        ...this.scope(organizationId, userId),
        ...parseInboxCursor(cursor),
      }),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: PAGE_LIMIT + 1,
      include: { event: true },
    });
    const page = rows.slice(0, PAGE_LIMIT);
    const isAdmin =
      member.role.key === MemberRole.OWNER ||
      member.role.key === MemberRole.ADMIN;
    const restrictToAssignedBrands = !isAdmin && member.brands.length > 0;
    const executions = await this.prisma.workflowExecution.findMany({
      where: {
        organizationId,
        isDeleted: false,
        id: {
          in: page
            .filter((row) => row.event.sourceType === 'workflow_execution')
            .map((row) => row.event.sourceId),
        },
        workflow: {
          organizationId,
          isDeleted: false,
          userId,
          OR: [
            { brandId: null },
            {
              brand: {
                organizationId,
                isDeleted: false,
                ...(restrictToAssignedBrands
                  ? { id: { in: member.brands.map((brand) => brand.id) } }
                  : {}),
              },
            },
          ],
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
      },
    });
    const sources = new Map(
      executions
        .filter(
          (source) =>
            source.workflow.brand &&
            !hasSystemWorkflowMetadata(source.workflow.metadata),
        )
        .map((source) => [source.id, source]),
    );
    const threadEvents = await Promise.all(
      page
        .filter((row) => row.event.sourceType === 'agent_run')
        .map((row) =>
          this.prisma.agentThreadEvent.findFirst({
            where: {
              organizationId,
              isDeleted: false,
              runId: row.event.sourceId,
              thread: {
                organizationId,
                userId,
                isDeleted: false,
                OR: [
                  { brandId: null },
                  {
                    brand: {
                      organizationId,
                      isDeleted: false,
                      ...(restrictToAssignedBrands
                        ? { id: { in: member.brands.map((brand) => brand.id) } }
                        : {}),
                    },
                  },
                ],
              },
            },
            select: {
              runId: true,
              thread: {
                select: {
                  id: true,
                  title: true,
                  brand: { select: { slug: true } },
                },
              },
            },
            orderBy: { sequence: 'desc' },
          }),
        ),
    );
    const threads = new Map(
      threadEvents
        .filter((event) => event !== null)
        .map((event) => [event.runId, event.thread]),
    );

    const docs = page.map((row) => {
      const source = sources.get(row.event.sourceId);
      const thread = threads.get(row.event.sourceId);
      const path = thread
        ? `${APP_ROUTES.AGENT.ROOT}/${encodeURIComponent(thread.id)}`
        : source
          ? `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${encodeURIComponent(source.workflowId)}?execution=${encodeURIComponent(source.id)}`
          : null;
      const brandSlug = thread?.brand?.slug ?? source?.workflow.brand?.slug;
      return {
        id: row.id,
        topic: row.topic,
        occurredAt: row.occurredAt,
        readAt: row.readAt,
        outcome: row.event.eventKey.endsWith('.completed')
          ? 'completed'
          : 'failed',
        sourceHref: inboxSourceHref(member.organization.slug, brandSlug, path),
        sourceLabel:
          thread?.title?.slice(0, 300) ??
          source?.workflow.label?.slice(0, 300) ??
          null,
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
