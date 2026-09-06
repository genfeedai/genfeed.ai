import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { getToolByName } from '@genfeedai/actions';
import type {
  AgentMutationApprovalData,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';

const PRIVATE_FIELD =
  /secret|password|token|authorization|credential|api.?key/i;

function describeValue(value: unknown): string {
  if (Array.isArray(value))
    return value.map(describeValue).join(', ') || 'None';
  if (value && typeof value === 'object') {
    return (
      Object.entries(value)
        .filter(([key]) => !PRIVATE_FIELD.test(key))
        .map(([key, item]) => `${humanize(key)}: ${describeValue(item)}`)
        .join('; ') || 'None'
    );
  }
  return value == null || value === '' ? 'None' : String(value);
}

function humanize(value: string): string {
  const text = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildMutationApprovalCard(
  approvalId: string,
  toolName: string,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext,
): AgentUiAction {
  const sourceActionId = `mutation-approval:${approvalId}`;
  const summary = humanize(toolName);
  const definition = getToolByName(toolName);
  return {
    id: sourceActionId,
    type: 'mutation_approval_card',
    title: summary,
    description:
      definition?.description ?? 'Review this action before it runs.',
    requiresConfirmation: true,
    data: {
      approvalId,
      sourceActionId,
      summary,
      items: Object.entries(parameters)
        .filter(([key]) => !PRIVATE_FIELD.test(key))
        .map(([key, value]) => ({
          label: humanize(key),
          value: describeValue(value),
        })),
      status: 'pending',
      scopeVersion: context.validatedScope?.contextVersion,
      brandId: context.validatedScope?.brandId ?? null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } satisfies AgentMutationApprovalData,
    ctas: [
      {
        action: 'confirm_mutation',
        label: 'Approve',
        payload: { approvalId, sourceActionId },
      },
      {
        action: 'decline_mutation',
        label: 'Decline',
        payload: { approvalId, sourceActionId },
      },
    ],
  };
}
