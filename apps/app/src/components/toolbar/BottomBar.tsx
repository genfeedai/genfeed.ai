'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  ChevronUp,
  Minus,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';

const MIN_BATCH = 1;
const MAX_BATCH = 10;

export function BottomBar() {
  const [batchCount, setBatchCount] = useState(1);
  const [currentBatchRun, setCurrentBatchRun] = useState(0);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const batchCancelledRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isRunning = useExecutionStore((s) => s.isRunning);
  const executeWorkflow = useExecutionStore((s) => s.executeWorkflow);
  const executeSelectedNodes = useExecutionStore((s) => s.executeSelectedNodes);
  const resumeFromFailed = useExecutionStore((s) => s.resumeFromFailed);
  const canResumeFromFailed = useExecutionStore((s) => s.canResumeFromFailed);
  const stopExecution = useExecutionStore((s) => s.stopExecution);
  const requestConfirmation = useRunWorkflowConfirmationStore(
    (s) => s.requestConfirmation,
  );
  const _lastFailedNodeId = useExecutionStore((s) => s.lastFailedNodeId);

  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds);
  const nodes = useWorkflowStore((s) => s.nodes);
  const validateWorkflow = useWorkflowStore((s) => s.validateWorkflow);

  const canRunWorkflow = useMemo(() => {
    if (nodes.length === 0) return false;
    const validation = validateWorkflow();
    return validation.isValid;
  }, [nodes, validateWorkflow]);

  const hasSelection = selectedNodeIds.length > 0;
  const showResume = canResumeFromFailed();

  const decrementBatch = useCallback(() => {
    setBatchCount((prev) => Math.max(MIN_BATCH, prev - 1));
  }, []);

  const incrementBatch = useCallback(() => {
    setBatchCount((prev) => Math.min(MAX_BATCH, prev + 1));
  }, []);

  const waitForExecutionEnd = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      // If not running, resolve immediately
      if (!useExecutionStore.getState().isRunning) {
        resolve();
        return;
      }
      const unsubscribe = useExecutionStore.subscribe((state) => {
        if (!state.isRunning) {
          unsubscribe();
          resolve();
        }
      });
    });
  }, []);

  const runBatch = useCallback(async () => {
    batchCancelledRef.current = false;
    setIsBatchRunning(true);

    const accumulatedImages = new Map<string, string[]>();

    for (let i = 0; i < batchCount; i++) {
      if (batchCancelledRef.current) break;

      setCurrentBatchRun(i + 1);
      executeWorkflow();

      // Wait a tick for isRunning to be set
      await new Promise((r) => setTimeout(r, 50));

      // If execution didn't start (validation error), abort
      if (!useExecutionStore.getState().isRunning) break;

      await waitForExecutionEnd();

      // Check if execution failed
      if (useExecutionStore.getState().lastFailedNodeId) break;

      // Accumulate outputImages from imageGen nodes across batch runs
      const { nodes: currentNodes, updateNodeData } =
        useWorkflowStore.getState();
      for (const node of currentNodes) {
        if (node.type !== 'imageGen') continue;
        const nodeData = node.data as Record<string, unknown>;
        const newImages = nodeData.outputImages as string[] | undefined;
        if (!newImages?.length) continue;

        const existing = accumulatedImages.get(node.id) || [];
        const merged = [...existing, ...newImages];
        accumulatedImages.set(node.id, merged);
        updateNodeData(node.id, { outputImages: merged });
      }
    }

    setIsBatchRunning(false);
    setCurrentBatchRun(0);
  }, [batchCount, executeWorkflow, waitForExecutionEnd]);

  const handlePrimaryClick = useCallback(() => {
    if (isRunning || isBatchRunning) {
      batchCancelledRef.current = true;
      stopExecution();
      return;
    }

    if (batchCount > 1) {
      requestConfirmation(() => runBatch());
    } else {
      requestConfirmation(() => executeWorkflow());
    }
  }, [
    isRunning,
    isBatchRunning,
    batchCount,
    runBatch,
    executeWorkflow,
    stopExecution,
    requestConfirmation,
  ]);

  const handleRunSelected = useCallback(() => {
    if (!isRunning && hasSelection) {
      executeSelectedNodes();
      setDropdownOpen(false);
    }
  }, [isRunning, hasSelection, executeSelectedNodes]);

  const handleResume = useCallback(() => {
    if (canResumeFromFailed()) {
      resumeFromFailed();
      setDropdownOpen(false);
    }
  }, [canResumeFromFailed, resumeFromFailed]);

  const isActive = isRunning || isBatchRunning;

  return (
    <div
      aria-label="Workflow controls"
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2"
      onMouseDown={(e) => e.stopPropagation()}
      role="toolbar"
      tabIndex={-1}
    >
      <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/95 px-2 py-1 shadow-lg backdrop-blur-sm">
        {/* Batch Counter */}
        <div className="flex items-center gap-0.5">
          <span className="mr-0.5 text-[11px] text-muted-foreground">
            Batch
          </span>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={decrementBatch}
            isDisabled={batchCount <= MIN_BATCH || isActive}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-hover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            icon={<Minus className="size-2.5" />}
          />
          <span className="w-4 text-center text-xs font-medium tabular-nums text-foreground">
            {batchCount}
          </span>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={incrementBatch}
            isDisabled={batchCount >= MAX_BATCH || isActive}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-hover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            icon={<Plus className="size-2.5" />}
          />
        </div>

        {/* Divider */}
        <div className="mx-1 h-4 w-px bg-border" />

        {/* Run Button with Dropdown */}
        <div className="relative flex items-center">
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={(e) => {
              e.stopPropagation();
              handlePrimaryClick();
            }}
            isDisabled={!isActive && !canRunWorkflow}
            className={`flex h-7 items-center gap-1.5 rounded-l px-3 text-xs font-medium transition ${
              isActive
                ? 'bg-destructive/90 text-white hover:bg-destructive'
                : canRunWorkflow
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-tertiary text-muted-foreground'
            } disabled:cursor-not-allowed`}
          >
            {isActive ? (
              <>
                <Square className="size-3.5" />
                Stop
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                Run
              </>
            )}
          </Button>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((prev) => !prev);
            }}
            isDisabled={isActive}
            className={`flex h-7 items-center rounded-r border-l px-1.5 transition ${
              isActive
                ? 'border-destructive/30 bg-destructive/90 text-white'
                : canRunWorkflow
                  ? 'border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border bg-tertiary text-muted-foreground'
            } disabled:cursor-not-allowed`}
            icon={<ChevronUp className="size-3.5" />}
          />

          {/* Dropdown Menu (opens upward) */}
          {dropdownOpen && (
            <>
              {/* Backdrop */}
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                aria-label="Close execution menu"
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div
                ref={dropdownRef}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-full left-0 z-50 mb-1.5 min-w-[180px] rounded-md border border-border bg-secondary py-0.5 shadow-xl"
                role="menu"
                tabIndex={-1}
              >
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => {
                    requestConfirmation(() => executeWorkflow());
                    setDropdownOpen(false);
                  }}
                  isDisabled={!canRunWorkflow}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-foreground/88 transition hover:bg-hover disabled:text-muted-foreground disabled:hover:bg-transparent"
                  icon={<Play className="size-3" />}
                >
                  Run Workflow
                </Button>
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={handleRunSelected}
                  isDisabled={!hasSelection || isRunning}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-foreground/88 transition hover:bg-hover disabled:text-muted-foreground disabled:hover:bg-transparent"
                  icon={<PlayCircle className="size-3" />}
                >
                  Run Selected ({selectedNodeIds.length})
                </Button>
                {showResume && (
                  <>
                    <div className="mx-2 my-0.5 h-px bg-border" />
                    <Button
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      onClick={handleResume}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-foreground/88 transition hover:bg-hover"
                      icon={<RotateCcw className="size-3" />}
                    >
                      Resume from Failed
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Batch Progress */}
        {isBatchRunning && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {currentBatchRun}/{batchCount}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
