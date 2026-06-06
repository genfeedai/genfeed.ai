'use client';

import type {
  HandleDefinition,
  WorkflowInterface,
  WorkflowRefNodeData,
} from '@genfeedai/types';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { clsx } from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  type ReferencableWorkflow,
  workflowRefApi,
} from './workflow-ref-node.helpers';

// Handle color CSS variables (used inline for guaranteed override)
const HANDLE_COLORS: Record<string, string> = {
  audio: 'var(--handle-audio)',
  image: 'var(--handle-image)',
  number: 'var(--handle-number)',
  text: 'var(--handle-text)',
  video: 'var(--handle-video)',
};

function WorkflowHandles({
  handles,
  position,
}: {
  handles: HandleDefinition[];
  position: Position.Left | Position.Right;
}) {
  const handleType = position === Position.Left ? 'target' : 'source';

  return (
    <>
      {handles.map((handle, index) => (
        <Handle
          key={handle.id}
          type={handleType}
          position={position}
          id={handle.id}
          className="!w-3 !h-3"
          style={{
            background: HANDLE_COLORS[handle.type],
            top: `${((index + 1) / (handles.length + 1)) * 100}%`,
          }}
          title={`${handle.label} (${handle.type})${
            handle.required ? ' - required' : ''
          }`}
        />
      ))}
    </>
  );
}

function WorkflowRefHeader({
  isProcessing,
  label,
  status,
}: {
  isProcessing: boolean;
  label?: string;
  status?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
      <GitBranch className="size-4 text-foreground" />
      <span className="flex-1 truncate text-sm font-medium text-foreground">
        {label || 'Subworkflow'}
      </span>
      {isProcessing && <Loader2 className="size-4 animate-spin text-primary" />}
      {status === 'complete' && (
        <CheckCircle2 className="size-4 text-chart-2" />
      )}
      {status === 'error' && (
        <AlertCircle className="size-4 text-destructive" />
      )}
    </div>
  );
}

interface WorkflowSelectorSectionProps {
  error: string | null;
  isFetchingWorkflows: boolean;
  onWorkflowChange: (selectedId: string) => void;
  referencedWorkflowId: string | null | undefined;
  workflows: ReferencableWorkflow[];
}

function WorkflowSelectorSection({
  error,
  isFetchingWorkflows,
  onWorkflowChange,
  referencedWorkflowId,
  workflows,
}: WorkflowSelectorSectionProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Referenced Workflow</Label>
        <Select
          value={referencedWorkflowId || 'none'}
          onValueChange={onWorkflowChange}
          disabled={isFetchingWorkflows}
        >
          <SelectTrigger className="nodrag h-9 w-full">
            <SelectValue placeholder="Select a workflow…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select a workflow…</SelectItem>
            {workflows.map((workflow) => (
              <SelectItem key={workflow._id} value={workflow._id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFetchingWorkflows && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </div>
      )}
    </>
  );
}

interface WorkflowInterfaceSummaryProps {
  cachedInterface: WorkflowInterface;
  isFetchingWorkflows: boolean;
  onRefreshInterface: () => void;
}

function WorkflowInterfaceSummary({
  cachedInterface,
  isFetchingWorkflows,
  onRefreshInterface,
}: WorkflowInterfaceSummaryProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium">
          Interface
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRefreshInterface}
          disabled={isFetchingWorkflows}
          title="Refresh interface"
        >
          <RefreshCw
            className={clsx('size-3', isFetchingWorkflows && 'animate-spin')}
          />
        </Button>
      </div>

      <HandleList
        label="Inputs"
        handles={cachedInterface.inputs}
        showRequired
      />
      <HandleList label="Outputs" handles={cachedInterface.outputs} />
    </div>
  );
}

type InterfaceHandle =
  | WorkflowInterface['inputs'][number]
  | WorkflowInterface['outputs'][number];

function HandleList({
  handles,
  label,
  showRequired,
}: {
  handles: InterfaceHandle[];
  label: string;
  showRequired?: boolean;
}) {
  if (handles.length === 0) return null;

  return (
    <div className="text-[10px]">
      <span className="text-muted-foreground">{label}: </span>
      {handles.map((handle, index) => (
        <span key={handle.nodeId}>
          <span className="text-foreground">
            {handle.name}
            <span className="text-muted-foreground">:{handle.type}</span>
            {showRequired && 'required' in handle && handle.required && (
              <span className="text-destructive">*</span>
            )}
          </span>
          {index < handles.length - 1 && ', '}
        </span>
      ))}
    </div>
  );
}

function WorkflowRefMessages({
  childExecutionId,
  error,
  isFetchingWorkflows,
  workflowCount,
}: {
  childExecutionId?: string | null;
  error?: string;
  isFetchingWorkflows: boolean;
  workflowCount: number;
}) {
  return (
    <>
      {!isFetchingWorkflows && workflowCount === 0 && (
        <div className="text-[10px] text-muted-foreground text-center py-2">
          No reusable workflows found. Create a workflow with
          WorkflowInput/Output nodes first.
        </div>
      )}

      {childExecutionId && (
        <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
          Child execution: {childExecutionId.substring(0, 8)}...
        </div>
      )}

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 p-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </>
  );
}

function WorkflowRefNodeComponent(props: NodeProps) {
  const { id, data, selected } = props;
  const nodeData = data as WorkflowRefNodeData;
  const { updateNodeData, workflowId: currentWorkflowId } = useWorkflowStore();
  const [workflowListState, setWorkflowListState] = useState<{
    error: string | null;
    isFetchingWorkflows: boolean;
    workflows: ReferencableWorkflow[];
  }>({
    error: null,
    isFetchingWorkflows: false,
    workflows: [],
  });
  const { error, isFetchingWorkflows, workflows } = workflowListState;

  const loadReferencableWorkflows = useCallback(
    async (signal?: AbortSignal) => {
      setWorkflowListState((state) => ({
        ...state,
        error: null,
        isFetchingWorkflows: true,
      }));
      try {
        const response = await workflowRefApi.fetchReferencableWorkflows(
          currentWorkflowId,
          signal,
        );
        setWorkflowListState({
          error: null,
          isFetchingWorkflows: false,
          workflows: response,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setWorkflowListState((state) => ({
            ...state,
            error: 'Failed to load workflows',
            isFetchingWorkflows: false,
          }));
        }
      }
    },
    [currentWorkflowId],
  );

  // Fetch referencable workflows on mount
  useEffect(() => {
    const controller = new AbortController();
    void loadReferencableWorkflows(controller.signal);
    return () => controller.abort();
  }, [loadReferencableWorkflows]);

  const handleWorkflowChange = useCallback(
    async (selectedId: string) => {
      if (!selectedId || selectedId === 'none') {
        updateNodeData<WorkflowRefNodeData>(id, {
          cachedInterface: null,
          inputMappings: {},
          outputMappings: {},
          referencedWorkflowId: null,
          referencedWorkflowName: null,
        });
        return;
      }

      const selectedWorkflow = workflows.find((w) => w._id === selectedId);
      if (!selectedWorkflow) return;

      // Validate reference (check for circular dependency)
      if (currentWorkflowId) {
        try {
          await workflowRefApi.validateReference(currentWorkflowId, selectedId);
        } catch (err) {
          setWorkflowListState((state) => ({
            ...state,
            error: (err as Error).message || 'Circular reference detected',
          }));
          return;
        }
      }

      // Initialize empty input mappings for each input
      const inputMappings: Record<string, string | null> = {};
      for (const input of selectedWorkflow.interface.inputs) {
        inputMappings[input.name] = null;
      }

      // Initialize empty output mappings for each output
      const outputMappings: Record<string, string | null> = {};
      for (const output of selectedWorkflow.interface.outputs) {
        outputMappings[output.name] = null;
      }

      updateNodeData<WorkflowRefNodeData>(id, {
        cachedInterface: selectedWorkflow.interface,
        inputMappings,
        label: `Subworkflow: ${selectedWorkflow.name}`,
        outputMappings,
        referencedWorkflowId: selectedId,
        referencedWorkflowName: selectedWorkflow.name,
      });
      setWorkflowListState((state) => ({ ...state, error: null }));
    },
    [id, updateNodeData, workflows, currentWorkflowId],
  );

  const handleRefreshInterface = useCallback(async () => {
    if (!nodeData.referencedWorkflowId) return;

    setWorkflowListState((state) => ({
      ...state,
      isFetchingWorkflows: true,
    }));
    try {
      const response = await workflowRefApi.fetchWorkflowInterface(
        nodeData.referencedWorkflowId,
      );

      // Update input mappings to include any new inputs
      const inputMappings: Record<string, string | null> = {
        ...nodeData.inputMappings,
      };
      for (const input of response.inputs) {
        if (!(input.name in inputMappings)) {
          inputMappings[input.name] = null;
        }
      }

      // Update output mappings
      const outputMappings: Record<string, string | null> = {
        ...nodeData.outputMappings,
      };
      for (const output of response.outputs) {
        if (!(output.name in outputMappings)) {
          outputMappings[output.name] = null;
        }
      }

      updateNodeData<WorkflowRefNodeData>(id, {
        cachedInterface: response,
        inputMappings,
        outputMappings,
      });
    } catch (err) {
      setWorkflowListState((state) => ({
        ...state,
        error: (err as Error).message || 'Failed to refresh interface',
      }));
    } finally {
      setWorkflowListState((state) => ({
        ...state,
        isFetchingWorkflows: false,
      }));
    }
  }, [
    id,
    nodeData.referencedWorkflowId,
    nodeData.inputMappings,
    nodeData.outputMappings,
    updateNodeData,
  ]);

  // Build dynamic input handles from cached interface
  const inputHandles: HandleDefinition[] = (
    nodeData.cachedInterface?.inputs ?? []
  ).map((input) => ({
    id: input.name,
    label: input.name,
    required: input.required,
    type: input.type,
  }));

  // Build dynamic output handles from cached interface
  const outputHandles: HandleDefinition[] = (
    nodeData.cachedInterface?.outputs ?? []
  ).map((output) => ({
    id: output.name,
    label: output.name,
    type: output.type,
  }));

  const isSelected = selected;
  const hasWorkflow = !!nodeData.referencedWorkflowId;
  const isProcessing = nodeData.status === 'processing';

  return (
    <div
      className={clsx(
        'relative min-w-[220px] border shadow-lg transition-all',
        'border-[var(--category-composition)] bg-card',
        isSelected && 'ring-1',
        isProcessing && 'node-processing',
      )}
      style={
        {
          '--node-color': 'var(--category-composition)',
          ...(isSelected && {
            '--tw-ring-color': 'var(--category-composition)',
          }),
        } as React.CSSProperties
      }
    >
      <WorkflowHandles handles={inputHandles} position={Position.Left} />
      <WorkflowRefHeader
        isProcessing={isProcessing}
        label={nodeData.label}
        status={nodeData.status}
      />

      {/* Content */}
      <div className="p-3 space-y-3">
        <WorkflowSelectorSection
          error={error}
          isFetchingWorkflows={isFetchingWorkflows}
          onWorkflowChange={handleWorkflowChange}
          referencedWorkflowId={nodeData.referencedWorkflowId}
          workflows={workflows}
        />

        {hasWorkflow && nodeData.cachedInterface && (
          <WorkflowInterfaceSummary
            cachedInterface={nodeData.cachedInterface}
            isFetchingWorkflows={isFetchingWorkflows}
            onRefreshInterface={handleRefreshInterface}
          />
        )}

        <WorkflowRefMessages
          childExecutionId={nodeData.childExecutionId}
          error={nodeData.error}
          isFetchingWorkflows={isFetchingWorkflows}
          workflowCount={workflows.length}
        />
      </div>

      <WorkflowHandles handles={outputHandles} position={Position.Right} />
    </div>
  );
}

export const WorkflowRefNode = memo(WorkflowRefNodeComponent);
