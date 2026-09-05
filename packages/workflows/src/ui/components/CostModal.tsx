'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@genfeedai/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@genfeedai/ui/primitives/dialog';
import { DollarSign } from 'lucide-react';
import { useMemo } from 'react';
import { calculateWorkflowCost, formatCost } from '../lib/costCalculator';
import { useExecutionStore } from '../stores/execution';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';

export function CostModal() {
  const { activeModal, closeModal } = useUIStore();
  const nodes = useWorkflowStore((state) => state.nodes);
  const actualCost = useExecutionStore((state) => state.actualCost);

  const isOpen = activeModal === 'cost';

  const breakdown = useMemo(() => calculateWorkflowCost(nodes), [nodes]);

  const handleClose = () => {
    closeModal();
  };

  if (!isOpen) return null;

  const hasActualCost = actualCost > 0;
  const variance = hasActualCost ? actualCost - breakdown.total : 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="size-4" aria-hidden="true" />
            Cost Breakdown
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div>
          {breakdown.items.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No billable nodes in workflow
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="max-h-[40vh] overflow-y-auto">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-left text-xs text-muted-foreground">
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
                        <TableCell className="py-2 text-muted-foreground font-mono text-xs">
                          {estimate.model}
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground text-xs">
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
              <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Total</span>
                  <span className="font-mono font-medium">
                    {formatCost(breakdown.total)}
                  </span>
                </div>
                {hasActualCost && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Actual Cost</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatCost(actualCost)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Variance</span>
                      <span
                        className={`font-mono text-xs ${
                          variance > 0
                            ? 'text-red-400'
                            : variance < 0
                              ? 'text-green-400'
                              : 'text-muted-foreground'
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
      </DialogContent>
    </Dialog>
  );
}
