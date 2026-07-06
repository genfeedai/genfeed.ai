'use client';

import type { AgentRunRowProps } from '@props/automation/agent-strategy.props';
import Badge from '@ui/display/badge/Badge';
import { TableCell, TableRow } from '@ui/primitives/table';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import AgentRunContentGrid from './AgentRunContentGrid';

const RUN_STATUS_VARIANTS: Record<
  string,
  'success' | 'warning' | 'error' | 'secondary'
> = {
  budget_exhausted: 'warning',
  completed: 'success',
  failed: 'error',
  pending: 'secondary',
  running: 'warning',
};

function getRunMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function getRunModelLabel(run: AgentRunRowProps['run']): string {
  const actualModel = getRunMetadataString(run.metadata, 'actualModel');
  const requestedModel = getRunMetadataString(run.metadata, 'requestedModel');

  if (actualModel && requestedModel && actualModel !== requestedModel) {
    return `${actualModel} via ${requestedModel}`;
  }

  return actualModel ?? requestedModel ?? 'Untracked';
}

export default function AgentRunRow({
  run,
  isExpanded,
  onToggle,
}: AgentRunRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer border-b border-white/5 transition-all duration-200 hover:bg-white/[0.02]"
        onClick={() => onToggle(run.id)}
      >
        <TableCell className="px-2 py-4 align-middle">
          {isExpanded ? (
            <HiChevronDown className="size-4 text-foreground/40" />
          ) : (
            <HiChevronRight className="size-4 text-foreground/40" />
          )}
        </TableCell>
        <TableCell className="p-4 align-middle">
          <Badge variant={RUN_STATUS_VARIANTS[run.status] ?? 'secondary'}>
            {run.status}
          </Badge>
        </TableCell>
        <TableCell className="p-4 align-middle text-sm">
          {run.creditsUsed ?? 0}
        </TableCell>
        <TableCell
          className="max-w-[18rem] p-4 align-middle text-sm text-foreground/60"
          title={getRunModelLabel(run)}
        >
          <span className="block truncate">{getRunModelLabel(run)}</span>
        </TableCell>
        <TableCell className="p-4 align-middle text-sm text-foreground/60">
          {run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : '—'}
        </TableCell>
        <TableCell className="p-4 align-middle text-sm text-foreground/60">
          {run.startedAt ? (
            <ClientFormattedDate format="relative" value={run.startedAt} />
          ) : (
            '—'
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell
            colSpan={6}
            className="border-b border-white/5 bg-foreground/[0.02]"
          >
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
                <span className="rounded bg-tertiary px-2 py-1">
                  Model: {getRunModelLabel(run)}
                </span>
                {getRunMetadataString(run.metadata, 'routingPolicy') && (
                  <span className="rounded bg-tertiary px-2 py-1">
                    Routing:{' '}
                    {getRunMetadataString(run.metadata, 'routingPolicy')}
                  </span>
                )}
                {run.metadata?.webSearchEnabled === true && (
                  <span className="rounded bg-tertiary px-2 py-1">
                    Web enabled
                  </span>
                )}
              </div>
              <AgentRunContentGrid runId={run.id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
