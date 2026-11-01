'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@genfeedai/ui/primitives/dropdown-menu';
import {
  ChevronUp,
  CirclePlay,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useExecutionStore } from '../stores/execution';
import { useWorkflowStore } from '../stores/workflow';

const MIN_BATCH = 1;
const MAX_BATCH = 10;

interface BatchCounterProps {
  batchCount: number;
  isActive: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}

function BatchCounter({
  batchCount,
  isActive,
  onDecrement,
  onIncrement,
}: BatchCounterProps) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-0.5 text-2xs text-muted-foreground">Batch</span>
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={onDecrement}
        disabled={batchCount <= MIN_BATCH || isActive}
        className="size-5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Minus className="size-2.5" />
      </Button>
      <span className="w-4 text-center text-xs font-medium tabular-nums text-foreground">
        {batchCount}
      </span>
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={onIncrement}
        disabled={batchCount >= MAX_BATCH || isActive}
        className="size-5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-2.5" />
      </Button>
    </div>
  );
}

interface RunOptionsState {
  canRunWorkflow: boolean;
  hasSelection: boolean;
  isRunning: boolean;
  selectedCount: number;
  showResume: boolean;
}

interface RunOptionsMenuItemsProps {
  onResume: () => void;
  onRunSelected: () => void;
  onRunWorkflow: () => void;
  state: RunOptionsState;
}

function RunOptionsMenuItems({
  onResume,
  onRunSelected,
  onRunWorkflow,
  state,
}: RunOptionsMenuItemsProps) {
  const { canRunWorkflow, hasSelection, isRunning, selectedCount, showResume } =
    state;

  return (
    <DropdownMenuContent align="start" className="min-w-[180px]" side="top">
      <DropdownMenuItem disabled={!canRunWorkflow} onSelect={onRunWorkflow}>
        <Play className="size-3" />
        Run Workflow
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!hasSelection || isRunning}
        onSelect={onRunSelected}
      >
        <CirclePlay className="size-3" />
        Run Selected ({selectedCount})
      </DropdownMenuItem>
      {showResume && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onResume}>
            <RotateCcw className="size-3" />
            Resume from Failed
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

interface RunControlsState extends RunOptionsState {
  canRunWorkflow: boolean;
  isActive: boolean;
}

interface RunControlsProps {
  onPrimaryClick: () => void;
  onResume: () => void;
  onRunSelected: () => void;
  onRunWorkflow: () => void;
  state: RunControlsState;
}

function RunControls({
  onPrimaryClick,
  onResume,
  onRunSelected,
  onRunWorkflow,
  state,
}: RunControlsProps) {
  const {
    canRunWorkflow,
    hasSelection,
    isActive,
    isRunning,
    selectedCount,
    showResume,
  } = state;
  const variant = isActive
    ? ButtonVariant.DESTRUCTIVE
    : canRunWorkflow
      ? ButtonVariant.DEFAULT
      : ButtonVariant.SECONDARY;

  return (
    <div className="relative flex items-center">
      <Button
        withWrapper={false}
        variant={variant}
        size={ButtonSize.SM}
        onClick={(e) => {
          e.stopPropagation();
          onPrimaryClick();
        }}
        disabled={!isActive && !canRunWorkflow}
        className={`rounded-l rounded-r-none px-3 text-xs font-medium ${
          isActive
            ? 'bg-destructive/90 hover:bg-destructive'
            : canRunWorkflow
              ? ''
              : 'bg-muted text-muted-foreground'
        }`}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ariaLabel="Run options"
            withWrapper={false}
            variant={variant}
            size={ButtonSize.SM}
            disabled={isActive}
            className={`rounded-l-none rounded-r border-l px-1.5 ${
              isActive
                ? 'border-destructive/20 bg-destructive/90'
                : canRunWorkflow
                  ? 'border-border-strong'
                  : 'border-border bg-muted text-muted-foreground'
            }`}
          >
            <ChevronUp className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <RunOptionsMenuItems
          onResume={onResume}
          onRunSelected={onRunSelected}
          onRunWorkflow={onRunWorkflow}
          state={{
            canRunWorkflow,
            hasSelection,
            isRunning,
            selectedCount,
            showResume,
          }}
        />
      </DropdownMenu>
    </div>
  );
}

function BatchProgress({
  batchCount,
  currentBatchRun,
}: {
  batchCount: number;
  currentBatchRun: number;
}) {
  return (
    <>
      <div className="mx-1 h-4 w-px bg-border" />
      <span className="text-2xs tabular-nums text-muted-foreground">
        {currentBatchRun}/{batchCount}
      </span>
    </>
  );
}

export function BottomBar() {
  const [batchCount, setBatchCount] = useState(1);
  const [currentBatchRun, setCurrentBatchRun] = useState(0);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const batchCancelledRef = useRef(false);

  const isRunning = useExecutionStore((s) => s.isRunning);
  const executeWorkflow = useExecutionStore((s) => s.executeWorkflow);
  const executeSelectedNodes = useExecutionStore((s) => s.executeSelectedNodes);
  const resumeFromFailed = useExecutionStore((s) => s.resumeFromFailed);
  const canResumeFromFailed = useExecutionStore((s) => s.canResumeFromFailed);
  const stopExecution = useExecutionStore((s) => s.stopExecution);
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

    async function runBatchStep(batchIndex: number): Promise<void> {
      if (batchIndex >= batchCount || batchCancelledRef.current) return;

      setCurrentBatchRun(batchIndex + 1);
      executeWorkflow();

      // Wait a tick for isRunning to be set
      await new Promise((r) => setTimeout(r, 50));

      // If execution didn't start (validation error), abort
      if (!useExecutionStore.getState().isRunning) return;

      await waitForExecutionEnd();

      if (useExecutionStore.getState().lastFailedNodeId) return;

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

      return runBatchStep(batchIndex + 1);
    }

    await runBatchStep(0);
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
      runBatch();
    } else {
      executeWorkflow();
    }
  }, [
    isRunning,
    isBatchRunning,
    batchCount,
    runBatch,
    executeWorkflow,
    stopExecution,
  ]);

  const handleRunSelected = useCallback(() => {
    if (!isRunning && hasSelection) {
      executeSelectedNodes();
    }
  }, [isRunning, hasSelection, executeSelectedNodes]);

  const handleResume = useCallback(() => {
    if (canResumeFromFailed()) {
      resumeFromFailed();
    }
  }, [canResumeFromFailed, resumeFromFailed]);

  const handleRunWorkflowFromMenu = useCallback(() => {
    executeWorkflow();
  }, [executeWorkflow]);

  const isActive = isRunning || isBatchRunning;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 bg-muted/90 px-2 py-1 shadow-dropdown backdrop-blur-sm">
        <BatchCounter
          batchCount={batchCount}
          isActive={isActive}
          onDecrement={decrementBatch}
          onIncrement={incrementBatch}
        />
        <div className="mx-1 h-4 w-px bg-border" />
        <RunControls
          onPrimaryClick={handlePrimaryClick}
          onResume={handleResume}
          onRunSelected={handleRunSelected}
          onRunWorkflow={handleRunWorkflowFromMenu}
          state={{
            canRunWorkflow,
            hasSelection,
            isActive,
            isRunning,
            selectedCount: selectedNodeIds.length,
            showResume,
          }}
        />
        {isBatchRunning && (
          <BatchProgress
            batchCount={batchCount}
            currentBatchRun={currentBatchRun}
          />
        )}
      </div>
    </div>
  );
}
