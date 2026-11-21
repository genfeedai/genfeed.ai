import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  MCP_APPROVAL_EXPIRED_REASON,
  MCP_APPROVAL_EXPIRY_DAYS,
} from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus, type Prisma } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { traced } from '@libs/tracing/traced';

const MS_PER_DAY = 86_400_000;

function readTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * The latest time a queued scheduling request would publish at, across its
 * release(s) and their targets. Null when it names no time at all, so a request
 * without one is never closed for being late.
 */
export function latestScheduledTime(args: unknown): number | null {
  if (!isRecord(args)) return null;
  const releases = Array.isArray(args.releases)
    ? args.releases
    : [args.release];
  const times = releases.flatMap((release) => {
    if (!isRecord(release)) return [];
    const targets = Array.isArray(release.targets) ? release.targets : [];
    return [
      readTime(release.scheduledDate),
      ...targets.map((target) =>
        isRecord(target) ? readTime(target.scheduledDate) : null,
      ),
    ].filter((time): time is number => time !== null);
  });
  return times.length > 0 ? Math.max(...times) : null;
}

/** The moment before which a pending approval is stale. */
export function mcpApprovalExpiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MCP_APPROVAL_EXPIRY_DAYS * MS_PER_DAY);
}

/**
 * Closes the organization's pending MCP approvals older than the expiry age as
 * declined with the reason `expired` (#10134), so an abandoned request stops
 * counting toward the pending cap and leaves the review inbox. Returns how
 * many it closed.
 */
export const expireStaleMcpApprovals = traced(
  'expireStaleMcpApprovals',
  async (
    delegate: Pick<Prisma.McpApprovalDelegate, 'updateMany'>,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<number> => {
    const { count } = await delegate.updateMany({
      data: {
        resolvedAt: now,
        result: { reason: MCP_APPROVAL_EXPIRED_REASON },
        status: McpApprovalStatus.DECLINED,
      },
      where: scopedWhere(organizationId, {
        createdAt: { lt: mcpApprovalExpiryCutoff(now) },
        status: McpApprovalStatus.PENDING,
      }),
    });
    return count;
  },
);

/**
 * Closes the pending scheduling requests whose publish times have all passed, as
 * declined with the reason `expired`: approving one now would publish nothing on
 * time. Takes the pending rows the caller already read, so it adds no query to
 * the listing. Returns the ids it closed.
 */
export const expireLateSchedulingApprovals = traced(
  'expireLateSchedulingApprovals',
  async (
    delegate: Pick<Prisma.McpApprovalDelegate, 'updateMany'>,
    organizationId: string,
    pending: readonly { arguments: unknown; id: string; toolName: string }[],
    now: Date = new Date(),
  ): Promise<string[]> => {
    const lateIds = pending
      .filter((approval) => {
        if (approval.toolName !== 'create_scheduled_release') return false;
        const latest = latestScheduledTime(approval.arguments);
        return latest !== null && latest < now.getTime();
      })
      .map((approval) => approval.id);
    if (lateIds.length === 0) return [];
    await delegate.updateMany({
      data: {
        resolvedAt: now,
        result: { reason: MCP_APPROVAL_EXPIRED_REASON },
        status: McpApprovalStatus.DECLINED,
      },
      where: scopedWhere(organizationId, {
        id: { in: lateIds },
        status: McpApprovalStatus.PENDING,
      }),
    });
    return lateIds;
  },
);
