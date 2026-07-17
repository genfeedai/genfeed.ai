import type {
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';

const RUN_STATUS_CLASS_NAMES: Readonly<Record<string, string>> = {
  COMPLETED: 'bg-success/10 text-success',
  FAILED: 'bg-destructive/10 text-destructive',
  PENDING: 'bg-warning/10 text-warning',
  RUNNING: 'bg-info/10 text-info',
};

const CANCELLABLE_RUN_STATUSES = new Set(['PENDING', 'RUNNING']);
const RETRYABLE_RUN_STATUSES = new Set(['CANCELLED', 'FAILED']);

export type AgentRunAction = 'cancel' | 'retry';

export type AgentRunProvenanceItem = {
  className?: string;
  label: string;
  value: string;
};

export function normalizeRunStatus(status?: string): string {
  return status?.trim().toUpperCase() || 'UNKNOWN';
}

export function formatRunStatus(status?: string): string {
  return normalizeRunStatus(status)
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getRunStatusClassName(status?: string): string {
  return (
    RUN_STATUS_CLASS_NAMES[normalizeRunStatus(status)] ??
    'bg-muted text-muted-foreground'
  );
}

export function isRunCancellable(status?: string): boolean {
  return CANCELLABLE_RUN_STATUSES.has(normalizeRunStatus(status));
}

export function isRunRetryable(status?: string): boolean {
  return RETRYABLE_RUN_STATUSES.has(normalizeRunStatus(status));
}

export function getRunThreadId(run: AgentRunSummary): string | null {
  return typeof run.thread === 'string' && run.thread.length > 0
    ? run.thread
    : null;
}

export function formatRunTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Not started';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatRunDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number') {
    return '—';
  }

  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Object.prototype.toString.call(value) === '[object Object]'
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readRunMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readRunAgentScopeString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  return readRunMetadataString(asRecord(metadata?.agentScope), key);
}

export function getRunProgress(run: AgentRunSummary): number {
  return Math.min(100, Math.max(0, run.progress ?? 0));
}

function getRunModel(run: AgentRunSummary): string {
  return (
    [
      readRunMetadataString(run.metadata, 'actualModel'),
      readRunMetadataString(run.metadata, 'requestedModel'),
      readRunMetadataString(run.metadata, 'model'),
    ].find(Boolean) ?? '—'
  );
}

function getRunSource(run: AgentRunSummary): string {
  return readRunMetadataString(run.metadata, 'source') ?? 'Agent workspace';
}

function getRunBrandScope(run: AgentRunSummary): string {
  return (
    (typeof run.brand === 'string' ? run.brand : undefined) ??
    readRunAgentScopeString(run.metadata, 'brandId') ??
    'Organization-wide'
  );
}

function getRunCreditUsage(run: AgentRunSummary): string {
  const creditsUsed = String(run.creditsUsed ?? 0);
  return typeof run.creditBudget === 'number'
    ? `${creditsUsed} / ${run.creditBudget}`
    : creditsUsed;
}

function getRunStartTimestamp(run: AgentRunSummary): string {
  return formatRunTimestamp(run.startedAt ?? run.createdAt);
}

function getRunThreadLabel(run: AgentRunSummary): string {
  return getRunThreadId(run) ?? '—';
}

function getRunRetryCount(run: AgentRunSummary): string {
  return String(run.retryCount ?? 0);
}

function getRunArtifactCount(run: AgentRunSummary): string {
  return String(run.artifactReferences?.length ?? 0);
}

export function getRunProvenanceItems(
  run: AgentRunSummary,
): AgentRunProvenanceItem[] {
  return [
    { label: 'Started', value: getRunStartTimestamp(run) },
    { label: 'Duration', value: formatRunDuration(run.durationMs) },
    { label: 'Trigger', value: formatRunStatus(run.trigger) },
    { className: 'break-words', label: 'Model', value: getRunModel(run) },
    { className: 'break-words', label: 'Source', value: getRunSource(run) },
    {
      className: 'break-all',
      label: 'Brand scope',
      value: getRunBrandScope(run),
    },
    {
      className: 'break-all',
      label: 'Thread',
      value: getRunThreadLabel(run),
    },
    { label: 'Credits', value: getRunCreditUsage(run) },
    { label: 'Retries', value: getRunRetryCount(run) },
    { label: 'Artifacts', value: getRunArtifactCount(run) },
  ];
}

export function selectRunId(
  currentId: string | null,
  runs: AgentRunSummary[],
): string | null {
  const selectedRun = runs.find((run) => run.id === currentId);
  if (selectedRun) {
    return selectedRun.id;
  }

  const [firstRun] = runs;
  return firstRun ? firstRun.id : null;
}

export function replaceRunInPage(
  currentPage: AgentRunPage | null,
  run: AgentRunSummary,
): AgentRunPage | null {
  if (!currentPage) {
    return null;
  }

  return {
    ...currentPage,
    runs: currentPage.runs.map((currentRun) =>
      currentRun.id === run.id ? run : currentRun,
    ),
  };
}

export function getRunActionEffect(
  apiService: AgentApiService,
  action: AgentRunAction,
  runId: string,
  brandId?: string,
): ReturnType<AgentApiService['cancelRunEffect']> {
  return action === 'cancel'
    ? apiService.cancelRunEffect(runId, undefined, brandId)
    : apiService.retryRunEffect(runId, undefined, brandId);
}

export function getRunActionMessage(
  action: AgentRunAction,
  run: AgentRunSummary,
): string {
  return action === 'cancel'
    ? `${run.label} was cancelled.`
    : `${run.label} was queued for retry.`;
}

export function isRunDetailLoadable(
  authReady: boolean,
  isExpanded: boolean,
  selectedRunId: string | null,
): selectedRunId is string {
  return authReady && isExpanded && Boolean(selectedRunId);
}

export function updateIfRequestActive(
  signal: AbortSignal | undefined,
  update: () => void,
): void {
  if (!signal?.aborted) {
    update();
  }
}
