'use client';

import { DollarSign, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { calculateWorkflowCost, formatCost } from '../lib/costCalculator';
import { useExecutionStore } from '../stores/executionStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';

export function CostModal() {
  const { activeModal, closeModal } = useUIStore();
  const nodes = useWorkflowStore((state) => state.nodes);
  const actualCost = useExecutionStore((state) => state.actualCost);
  const backdropRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-lg"
        role="dialog"
        aria-label="Cost Breakdown"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[var(--muted-foreground)]" />
            <span className="text-sm font-medium">Cost Breakdown</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[var(--secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
                      <th className="pb-2 font-medium">Node</th>
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.items.map((estimate) => (
                      <tr
                        key={estimate.nodeId}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td
                          className="py-2 truncate max-w-[120px]"
                          title={estimate.nodeLabel}
                        >
                          {estimate.nodeLabel}
                        </td>
                        <td className="py-2 text-[var(--muted-foreground)] font-mono text-xs">
                          {estimate.model}
                        </td>
                        <td className="py-2 text-[var(--muted-foreground)] text-xs">
                          {estimate.unit}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {formatCost(estimate.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  );
}
