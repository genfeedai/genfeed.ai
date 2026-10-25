import {
  getToolByName,
  isMcpApprovalSkippable,
  requiresMcpApproval,
} from '@genfeedai/actions';
import { isMcpTextDraftCall } from '@genfeedai/actions/server';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { ClientService } from '@mcp/services/client.service';

/**
 * Whether a tool call is approval-gated by its declaration alone: declared approvals and
 * credit spenders, minus the concrete calls that cannot spend credits or dispatch
 * publishing. The API still validates their arguments, actor, brand and key permissions.
 */
export function isMcpApprovalGated(
  name: string,
  args?: Record<string, unknown>,
): boolean {
  if (name === 'create_post' && args && isMcpTextDraftCall(args)) return false;
  if (name === 'repurpose_post' && args?.mode === 'deterministic') return false;
  const release = args?.release;
  if (
    name === 'create_scheduled_release' &&
    isRecord(release) &&
    (release.status === undefined || release.status === 'draft') &&
    !release.scheduledDate &&
    Array.isArray(release.targets) &&
    release.targets.every((target) => isRecord(target) && !target.scheduledDate)
  ) {
    return false;
  }
  return requiresMcpApproval(getToolByName(name));
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
