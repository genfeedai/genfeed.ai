import { readApprovalOrigin } from '@api/publish-approvals/publish-approval-action-origin';
import type { ServerLogger } from '@api/server.dependencies';

/** One structured line per approval action; the dashboards query this shape. */
export function logApprovalTelemetry(
  logger: ServerLogger | undefined,
  action: 'approve' | 'execute' | 'reject' | 'revoke',
  outcome: 'failure' | 'success',
  integrity: 'blocked' | 'matched' | 'not_applicable',
  organizationId: string,
): void {
  logger?.log('conversation_shell_approval', {
    action,
    integrity,
    organizationId,
    origin: readApprovalOrigin(),
    outcome,
    telemetryQueryVersion: 1,
  });
}
