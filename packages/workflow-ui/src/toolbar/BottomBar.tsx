'use client';

import {
  ChevronUp,
  Minus,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { useExecutionStore } from '../stores/execution';
import { useWorkflowStore } from '../stores/workflow';
import { Button } from '../ui/button';

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
      <span className="mr-0.5 text-[11px] text-neutral-400">Batch</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDecrement}
        disabled={batchCount <= MIN_BATCH || isActive}
        className="size-5 text-neutral-400 hover:bg-neutral-700 hover:text-white"
      >
        <Minus className="size-2.5" />
      </Button>
      <span className="w-4 text-center text-xs font-medium tabular-nums text-white">
        {batchCount}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onIncrement}
        disabled={batchCount >= MAX_BATCH || isActive}
        className="size-5 text-neutral-400 hover:bg-neutral-700 hover:text-white"
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

interface RunOptionsDropdownProps {
  dropdownRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onResume: () => void;
  onRunSelected: () => void;
  onRunWorkflow: () => void;
  state: RunOptionsState;
}

function RunOptionsDropdown({
  dropdownRef,
  onClose,
  onResume,
  onRunSelected,
  onRunWorkflow,
  state,
}: RunOptionsDropdownProps) {
  const { canRunWorkflow, hasSelection, isRunning, selectedCount, showResume } =
    state;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="fixed inset-0 z-40 size-full p-0 opacity-0"
        onClick={onClose}
        aria-label="Close run options"
      />
      <div
        ref={dropdownRef}
        className="absolute bottom-full left-0 z-50 mb-1.5 min-w-[180px] border border-neutral-700 bg-neutral-800 py-0.5 shadow-xl"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onRunWorkflow}
          disabled={!canRunWorkflow}
          className="w-full justify-start gap-1.5 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          <Play className="size-3" />
          Run Workflow
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRunSelected}
          disabled={!hasSelection || isRunning}
          className="w-full justify-start gap-1.5 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          <PlayCircle className="size-3" />
          Run Selected ({selectedCount})
        </Button>
        {showResume && (
          <>
            <div className="mx-2 my-0.5 h-px bg-neutral-700" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onResume}
              className="w-full justify-start gap-1.5 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              <RotateCcw className="size-3" />
              Resume from Failed
            </Button>
          </>
        )}
      </div>
    </>
  );
}

interface RunControlsState extends RunOptionsState {
  canRunWorkflow: boolean;
  isActive: boolean;
  isDropdownOpen: boolean;
}

interface RunControlsProps {
  dropdownRef: RefObject<HTMLDivElement | null>;
  onCloseDropdown: () => void;
  onPrimaryClick: () => void;
  onResume: () => void;
  onRunSelected: () => void;
  onRunWorkflow: () => void;
  onToggleDropdown: () => void;
  state: RunControlsState;
}

function RunControls({
  dropdownRef,
  onCloseDropdown,
  onPrimaryClick,
  onResume,
  onRunSelected,
  onRunWorkflow,
  onToggleDropdown,
  state,
}: RunControlsProps) {
  const {
    canRunWorkflow,
    hasSelection,
    isActive,
    isDropdownOpen,
    isRunning,
    selectedCount,
    showResume,
  } = state;
  const variant = isActive
    ? 'destructive'
    : canRunWorkflow
      ? 'default'
      : 'secondary';

  return (
    <div className="relative flex items-center">
      <Button
        variant={variant}
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onPrimaryClick();
        }}
        disabled={!isActive && !canRunWorkflow}
        className={`rounded-l rounded-r-none px-3 text-xs font-medium ${
          isActive
            ? 'bg-red-500/90 hover:bg-red-500'
            : canRunWorkflow
              ? ''
              : 'bg-neutral-600 text-neutral-400'
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
      <Button
        variant={variant}
        size="sm"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDropdown();
        }}
        disabled={isActive}
        className={`rounded-l-none rounded-r border-l px-1.5 ${
          isActive
            ? 'border-red-400/30 bg-red-500/90'
            : canRunWorkflow
              ? 'border-neutral-300'
              : 'border-neutral-500 bg-neutral-600 text-neutral-400'
        }`}
      >
        <ChevronUp className="size-3.5" />
      </Button>

      {isDropdownOpen && (
        <RunOptionsDropdown
          dropdownRef={dropdownRef}
          onClose={onCloseDropdown}
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
      )}
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
      <div className="mx-1 h-4 w-px bg-neutral-600" />
      <span className="text-[11px] tabular-nums text-neutral-400">
        {currentBatchRun}/{batchCount}
      </span>
    </>
  );
}

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

      // Check if execution failed
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
      setDropdownOpen(false);
    }
  }, [isRunning, hasSelection, executeSelectedNodes]);

  const handleResume = useCallback(() => {
    if (canResumeFromFailed()) {
      resumeFromFailed();
      setDropdownOpen(false);
    }
  }, [canResumeFromFailed, resumeFromFailed]);

  const handleRunWorkflowFromMenu = useCallback(() => {
    executeWorkflow();
    setDropdownOpen(false);
  }, [executeWorkflow]);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  const isActive = isRunning || isBatchRunning;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 border border-neutral-700/80 bg-neutral-800/95 px-2 py-1 shadow-lg backdrop-blur-sm">
        <BatchCounter
          batchCount={batchCount}
          isActive={isActive}
          onDecrement={decrementBatch}
          onIncrement={incrementBatch}
        />
        <div className="mx-1 h-4 w-px bg-neutral-600" />
        <RunControls
          dropdownRef={dropdownRef}
          onCloseDropdown={closeDropdown}
          onPrimaryClick={handlePrimaryClick}
          onResume={handleResume}
          onRunSelected={handleRunSelected}
          onRunWorkflow={handleRunWorkflowFromMenu}
          onToggleDropdown={toggleDropdown}
          state={{
            canRunWorkflow,
            hasSelection,
            isActive,
            isDropdownOpen: dropdownOpen,
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
