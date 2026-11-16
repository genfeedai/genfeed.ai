import {
  getToolByName,
  isMcpApprovalSkippable,
  requiresMcpApproval,
} from '@genfeedai/actions';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { ClientService } from '@mcp/services/client.service';

/**
 * Whether a tool call is approval-gated by its declaration alone. Only posting and media
 * generation can be (`requiresMcpApproval`), minus release drafts that cannot dispatch
 * publishing. The API still validates their arguments, actor, brand and key permissions.
 */
export function isMcpApprovalGated(
  name: string,
  args?: Record<string, unknown>,
): boolean {
  if (name === 'create_scheduled_release' && args) {
    // A batch is a draft only when every release in it is.
    const releases = Array.isArray(args.releases)
      ? args.releases
      : [args.release];
    if (releases.length > 0 && releases.every(isUndatedDraftRelease)) {
      return false;
    }
  }
  return requiresMcpApproval(getToolByName(name));
}

/** A release that is a draft and carries no time to publish at. */
function isUndatedDraftRelease(release: unknown): boolean {
  return (
    isRecord(release) &&
    (release.status === undefined || release.status === 'draft') &&
    !release.scheduledDate &&
    Array.isArray(release.targets) &&
    release.targets.every((target) => isRecord(target) && !target.scheduledDate)
  );
}

/**
 * Whether an already-queued approval may still be run. Calls queued before the
 * approval scope narrowed to posting and media generation (brand creation, drafts,
 * paid reads) stay redeemable; a read tool, which has neither a write policy nor a
 * cost, never is.
 */
export function isMcpApprovalRedeemable(name: string): boolean {
  const tool = getToolByName(name);
  return (
    tool !== undefined &&
    (tool.mutationPolicy !== undefined || (tool.creditCost ?? 0) > 0)
  );
}

/**
 * Whether this call must wait in the approvals queue. A credit spender runs straight away
 * once the organization and the member have both turned "Require approval for MCP
 * requests" off; the API still checks credits and quotes. Outbound and other gated writes
 * are never waived, and a failed policy lookup keeps the approval.
 */
export async function requiresMcpToolApproval(
  client: Pick<ClientService, 'isApprovalRequired'>,
  name: string,
  args?: Record<string, unknown>,
): Promise<boolean> {
  if (!isMcpApprovalGated(name, args)) return false;
  return !isMcpApprovalSkippable(name) || (await client.isApprovalRequired());
}
