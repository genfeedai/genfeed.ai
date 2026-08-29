'use client';

import type { IWorkflowExecution } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { TableCell, TableRow } from '@ui/primitives/table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

interface WorkflowExecutionRowProps {
  execution: IWorkflowExecution;
  isExpanded: boolean;
  onToggle: (executionId: string) => void;
}

export default function WorkflowExecutionRow({
  execution,
  isExpanded,
  onToggle,
}: WorkflowExecutionRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer border-b border-border transition-colors duration-200 hover:bg-accent/30"
        onClick={() => onToggle(execution.id)}
      >
        <TableCell className="px-2 py-4 align-middle">
          {isExpanded ? (
            <ChevronDown className="size-4 text-foreground/40" />
          ) : (
            <ChevronRight className="size-4 text-foreground/40" />
          )}
        </TableCell>
        <TableCell className="p-4 align-middle">
          <Badge status={execution.status.toLowerCase()}>
            {execution.status.toLowerCase()}
          </Badge>
        </TableCell>
        <TableCell className="p-4 align-middle text-sm">
          {execution.creditsUsed}
        </TableCell>
        <TableCell className="p-4 align-middle text-sm text-foreground/60">
          {execution.nodeResults.length}
        </TableCell>
        <TableCell className="p-4 align-middle text-sm text-foreground/60">
          {execution.durationMs
            ? `${Math.round(execution.durationMs / 1000)}s`
            : '—'}
        </TableCell>
        <TableCell className="p-4 align-middle text-sm text-foreground/60">
          <ClientFormattedDate
            format="relative"
            value={execution.startedAt ?? execution.createdAt}
          />
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow>
          <TableCell
            className="border-b border-border bg-foreground/[0.02]"
            colSpan={6}
          >
            <div className="space-y-2 p-4 text-xs text-foreground/65">
              {execution.nodeResults.length === 0 ? (
                <p>No node results recorded yet.</p>
              ) : (
                execution.nodeResults.map((result) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={result.nodeId}
                  >
                    <span>{result.actionId ?? result.nodeId}</span>
                    <span>{result.status.toLowerCase()}</span>
                  </div>
                ))
              )}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
