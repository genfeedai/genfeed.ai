import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

const GITHUB_ISSUE_URL = 'https://github.com/genfeedai/genfeed.ai/issues/new';
const SUMMARY_MAX_LENGTH = 140;
const ISSUE_ERROR_MAX_LENGTH = 3000;
const NODE_FAILURE_PREFIX = /^Nodes failed:\s*/i;
const NODE_STEP_PREFIX = /^[a-z][a-z0-9-]*:\s+/;
const CONTRACT_FAILURE =
  /^(Action contract (?:input|output) validation failed)\s*\[action=([^\s\]]+)[^\]]*\]\s*(.*)$/s;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 1).trimEnd()}…`
    : value;
}

/** Strips the workflow plumbing ("Nodes failed: infer-turn:") from a run error. */
function stripNodePrefixes(error: string): string {
  let message = error.trim().replace(NODE_FAILURE_PREFIX, '');
  while (NODE_STEP_PREFIX.test(message)) {
    const stripped = message.replace(NODE_STEP_PREFIX, '');
    message = stripped.replace(NODE_FAILURE_PREFIX, '');
  }
  return message;
}

/**
 * One readable line for the table. The full error stays available behind the
 * row's details toggle, so this only has to say what went wrong.
 */
export function summarizeFailureError(error: string | undefined): string {
  if (!error) return '';
  const message = stripNodePrefixes(error);
  const contract = CONTRACT_FAILURE.exec(message);
  if (contract) {
    const [, label, action, violations] = contract;
    const violationCount = violations
      ? violations.split(';').filter((item) => item.trim()).length
      : 0;
    const suffix =
      violationCount > 0
        ? ` (${violationCount} schema ${violationCount === 1 ? 'violation' : 'violations'})`
        : '';
    return truncate(`${label} for ${action}${suffix}`, SUMMARY_MAX_LENGTH);
  }
  return truncate(message.split('\n')[0] ?? message, SUMMARY_MAX_LENGTH);
}

export function buildFailureIssueUrl(
  run: IWorkflowExecution,
  summary: string,
): string {
  const workflow = run.workflow?.label ?? run.workflowId;
  const organization = run.organization?.label
    ? `${run.organization.label} (${run.organizationId})`
    : run.organizationId;
  const error = run.error
    ? truncate(run.error, ISSUE_ERROR_MAX_LENGTH)
    : 'No error details recorded';
  const body = [
    `- Run: \`${run.id}\``,
    `- Organization: ${organization}`,
    `- Workflow: ${workflow}`,
    `- Reason: ${run.failureReason ?? 'UNKNOWN'}`,
    `- Failed at: ${run.completedAt ?? run.createdAt}`,
    '',
    '### Error',
    '```',
    error,
    '```',
  ].join('\n');
  const query = new URLSearchParams({
    body,
    labels: 'bug',
    title: truncate(`Agent run failed: ${summary || workflow}`, 120),
  });
  return `${GITHUB_ISSUE_URL}?${query}`;
}

export function buildFailureClipboardText(run: IWorkflowExecution): string {
  return [
    `Run: ${run.id}`,
    `Organization: ${run.organization?.label ?? run.organizationId}`,
    `Workflow: ${run.workflow?.label ?? run.workflowId}`,
    `Reason: ${run.failureReason ?? 'UNKNOWN'}`,
    `Failed at: ${run.completedAt ?? run.createdAt}`,
    `Error: ${run.error ?? ''}`,
  ].join('\n');
}
