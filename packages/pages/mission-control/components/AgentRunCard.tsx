'use client';

import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentExecutionStatus, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';

interface AgentRunCardProps {
  run: IAgentRun;
  onCancel?: (id: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string; pulse?: boolean }
> = {
  [AgentExecutionStatus.PENDING]: {
    color: 'bg-yellow-500/20 text-yellow-400',
    label: 'Pending',
  },
  [AgentExecutionStatus.RUNNING]: {
    color: 'bg-blue-500/20 text-blue-400',
    label: 'Running',
    pulse: true,
  },
  [AgentExecutionStatus.COMPLETED]: {
    color: 'bg-green-500/20 text-green-400',
    label: 'Completed',
  },
  [AgentExecutionStatus.FAILED]: {
    color: 'bg-red-500/20 text-red-400',
    label: 'Failed',
  },
  [AgentExecutionStatus.CANCELLED]: {
    color: 'bg-gray-500/20 text-gray-400',
    label: 'Cancelled',
  },
};

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function groupToolCalls(
  toolCalls: IAgentRun['toolCalls'],
): { name: string; count: number }[] {
  const grouped = new Map<string, number>();
  for (const tc of toolCalls) {
    grouped.set(tc.toolName, (grouped.get(tc.toolName) ?? 0) + 1);
  }
  return Array.from(grouped.entries()).map(([name, count]) => ({
    count,
    name,
  }));
}

function getMetadataString(
  metadata: IAgentRun['metadata'],
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function getModelSummary(run: IAgentRun): {
  actualModel?: string;
  requestedModel?: string;
  routingPolicy?: string;
} {
  return {
    actualModel: getMetadataString(run.metadata, 'actualModel'),
    requestedModel: getMetadataString(run.metadata, 'requestedModel'),
    routingPolicy: getMetadataString(run.metadata, 'routingPolicy'),
  };
}

export default function AgentRunCard({ run, onCancel }: AgentRunCardProps) {
  const statusConfig = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const isActive =
    run.status === AgentExecutionStatus.RUNNING ||
    run.status === AgentExecutionStatus.PENDING;
  const toolGroups = groupToolCalls(run.toolCalls);
  const { actualModel, requestedModel, routingPolicy } = getModelSummary(run);
  const modelLabel =
    actualModel && requestedModel && actualModel !== requestedModel
      ? `${actualModel} via ${requestedModel}`
      : actualModel || requestedModel;

  return (
    <div className="gen-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium ${statusConfig.color}`}
          >
            {statusConfig.pulse && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            )}
            {statusConfig.label}
          </span>
          <span className="text-sm font-medium">{run.label}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {run.creditsUsed > 0 && <span>{run.creditsUsed} credits</span>}
          <span>
            {run.completedAt
              ? formatRelativeTime(run.completedAt)
              : run.startedAt
                ? formatRelativeTime(run.startedAt)
                : formatRelativeTime(run.createdAt)}
          </span>
          {isActive && onCancel && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onCancel(run.id)}
              className="h-auto p-0 text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${run.progress}%` }}
          />
        </div>
      )}

      {(modelLabel || routingPolicy) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {modelLabel && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              Model: {modelLabel}
            </span>
          )}
          {routingPolicy && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              Routing: {routingPolicy}
            </span>
          )}
        </div>
      )}

      {/* Tool calls + duration */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {toolGroups.map((group) => (
            <span
              key={group.name}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground"
            >
              {group.name}
              {group.count > 1 && (
                <span className="font-mono">x{group.count}</span>
              )}
            </span>
          ))}
        </div>
        {run.durationMs && (
          <span className="text-xs text-muted-foreground">
            {formatDuration(run.durationMs)}
          </span>
        )}
      </div>

      {/* Error message */}
      {run.error && (
        <div className="text-xs text-red-400 truncate">{run.error}</div>
      )}
    </div>
  );
}
