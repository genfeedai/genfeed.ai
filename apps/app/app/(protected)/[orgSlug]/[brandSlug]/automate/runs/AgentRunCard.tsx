'use client';

import {
  AgentExecutionStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';

interface AgentRunCardProps {
  run: IAgentRun;
  onCancel?: (id: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  [AgentExecutionStatus.PENDING]: 'Pending',
  [AgentExecutionStatus.RUNNING]: 'Running',
  [AgentExecutionStatus.COMPLETED]: 'Completed',
  [AgentExecutionStatus.FAILED]: 'Failed',
  [AgentExecutionStatus.CANCELLED]: 'Cancelled',
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
  const statusLabel = STATUS_LABELS[run.status] ?? 'Pending';
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
          <Badge status={run.status}>{statusLabel}</Badge>
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
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              withWrapper={false}
              onClick={() => onCancel(run.id)}
              className="text-destructive hover:text-destructive"
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
            className="h-full bg-info transition-[width] duration-500"
            style={{ width: `${run.progress}%` }}
          />
        </div>
      )}

      {(modelLabel || routingPolicy) && (
        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
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
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs bg-muted text-muted-foreground"
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
        <div className="truncate text-xs text-destructive">{run.error}</div>
      )}
    </div>
  );
}
