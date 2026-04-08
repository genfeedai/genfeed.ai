'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@genfeedai/ui';
import { DollarSign, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { calculateWorkflowCost, formatCost } from '../lib/costCalculator';
import { useExecutionStore } from '../stores/executionStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';

export function CostModal() {
  const { activeModal, closeModal } = useUIStore();
  const nodes = useWorkflowStore((state) => state.nodes);
  const actualCost = useExecutionStore((state) => state.actualCost);
  const backdropRef = useRef<HTMLButtonElement>(null);

  const isOpen = activeModal === 'cost';

  const breakdown = useMemo(() => calculateWorkflowCost(nodes), [nodes]);

  const handleClose = () => {
    closeModal();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const hasActualCost = actualCost > 0;
  const variance = hasActualCost ? actualCost - breakdown.total : 0;

  return (
    <button
      type="button"
      ref={backdropRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] cursor-default border-none bg-transparent p-0 m-0"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="bg-[var(--background)] border border-[var(--border)] shadow-xl w-full max-w-lg"
        role="dialog"
        aria-label="Cost Breakdown"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[var(--muted-foreground)]" />
            <span className="text-sm font-medium">Cost Breakdown</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {breakdown.items.length === 0 ? (
            <div className="text-center text-[var(--muted-foreground)] py-8">
              No billable nodes in workflow
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="max-h-[40vh] overflow-y-auto">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-left text-xs text-[var(--muted-foreground)]">
                      <TableHead className="pb-2 font-medium">Node</TableHead>
                      <TableHead className="pb-2 font-medium">Model</TableHead>
                      <TableHead className="pb-2 font-medium">Unit</TableHead>
                      <TableHead className="pb-2 font-medium text-right">
                        Cost
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.items.map((estimate) => (
                      <TableRow key={estimate.nodeId}>
                        <TableCell
                          className="py-2 truncate max-w-[120px]"
                          title={estimate.nodeLabel}
                        >
                          {estimate.nodeLabel}
                        </TableCell>
                        <TableCell className="py-2 text-[var(--muted-foreground)] font-mono text-xs">
                          {estimate.model}
                        </TableCell>
                        <TableCell className="py-2 text-[var(--muted-foreground)] text-xs">
                          {estimate.unit}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono">
                          {formatCost(estimate.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">
                    Estimated Total
                  </span>
                  <span className="font-mono font-medium">
                    {formatCost(breakdown.total)}
                  </span>
                </div>
                {hasActualCost && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)]">
                        Actual Cost
                      </span>
                      <span className="font-mono font-medium text-green-500">
                        {formatCost(actualCost)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)]">
                        Variance
                      </span>
                      <span
                        className={`font-mono text-xs ${
                          variance > 0
                            ? 'text-red-400'
                            : variance < 0
                              ? 'text-green-400'
                              : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {variance > 0 ? '+' : ''}
                        {formatCost(variance)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
