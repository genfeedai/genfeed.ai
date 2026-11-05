const NODES_FAILED_PATTERN = /^Nodes failed: ([\w.-]+)(?:: ([\s\S]*))?$/;
const SYSTEM_WORKFLOW_PATTERN =
  /^System workflow (\S+) (failed|was cancelled)$/;
const URL_PATTERN = /\bhttps?:\/\/\S+/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_TIME_PATTERN = /\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g;
const LONG_ID_PATTERN = /\b(?=[a-z0-9]*\d)[a-z0-9]{16,}\b/gi;
const WHITESPACE_PATTERN = /\s+/g;
const MAX_REASON_LENGTH = 120;

/** Strips per-run values so the same cause on two runs groups together. */
function normalizeReason(reason: string): string {
  return reason
    .replace(URL_PATTERN, '<url>')
    .replace(UUID_PATTERN, '<id>')
    .replace(ISO_TIME_PATTERN, '<time>')
    .replace(LONG_ID_PATTERN, '<id>')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .slice(0, MAX_REASON_LENGTH);
}

/**
 * Every failed system workflow is thrown from the same frame, so Sentry put
 * unrelated causes (a transcribe download, an empty plan, a missing template)
 * in one issue (API-GENFEED-AI-8H). This groups them by failed node and cause
 * instead. Any other error keeps Sentry's default grouping.
 */
export function workflowFailureFingerprint(
  error: unknown,
): string[] | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (!message) return undefined;

  const nodeFailure = NODES_FAILED_PATTERN.exec(message);
  if (nodeFailure) {
    return [
      'workflow-node-failed',
      nodeFailure[1],
      normalizeReason(nodeFailure[2] ?? ''),
    ];
  }

  const systemFailure = SYSTEM_WORKFLOW_PATTERN.exec(message);
  if (systemFailure) {
    return ['system-workflow', systemFailure[1], systemFailure[2]];
  }

  return undefined;
}
