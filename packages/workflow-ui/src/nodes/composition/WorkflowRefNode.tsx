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

// Handle color CSS variables (used inline for guaranteed override)
const HANDLE_COLORS: Record<string, string> = {
  audio: 'var(--handle-audio)',
  image: 'var(--handle-image)',
  number: 'var(--handle-number)',
  text: 'var(--handle-text)',
  video: 'var(--handle-video)',
};

export interface ReferencableWorkflow {
  _id: string;
  name: string;
  description?: string;
  interface: WorkflowInterface;
}

/**
 * API adapter for WorkflowRefNode.
 * Host apps must call `setWorkflowRefApi()` to provide implementations.
 */
export interface WorkflowRefApi {
  fetchReferencableWorkflows: (
    excludeId?: string | null,
    signal?: AbortSignal,
  ) => Promise<ReferencableWorkflow[]>;
  validateReference: (
    parentWorkflowId: string,
    childWorkflowId: string,
  ) => Promise<void>;
  fetchWorkflowInterface: (workflowId: string) => Promise<WorkflowInterface>;
}

const noopApi: WorkflowRefApi = {
  fetchReferencableWorkflows: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: fetchReferencableWorkflows',
    );
    return [];
  },
  fetchWorkflowInterface: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: fetchWorkflowInterface',
    );
    return { inputs: [], outputs: [] } as WorkflowInterface;
  },
  validateReference: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: validateReference',
    );
  },
};

let workflowRefApi: WorkflowRefApi = noopApi;

/** Host apps call this to wire up the API layer for WorkflowRefNode. */
export function setWorkflowRefApi(api: WorkflowRefApi): void {
  workflowRefApi = api;
}

function WorkflowRefNodeComponent(props: NodeProps) {
  const { id, data, selected } = props;
  const nodeData = data as WorkflowRefNodeData;
  const { updateNodeData, workflowId: currentWorkflowId } = useWorkflowStore();
  const [workflows, setWorkflows] = useState<ReferencableWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch referencable workflows on mount
  useEffect(() => {
    const controller = new AbortController();

    async function fetchWorkflows() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await workflowRefApi.fetchReferencableWorkflows(
          currentWorkflowId,
          controller.signal,
        );
        setWorkflows(response);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load workflows');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchWorkflows();
    return () => controller.abort();
  }, [currentWorkflowId]);

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
          setError((err as Error).message || 'Circular reference detected');
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
      setError(null);
    },
    [id, updateNodeData, workflows, currentWorkflowId],
  );

  const handleRefreshInterface = useCallback(async () => {
    if (!nodeData.referencedWorkflowId) return;

    setIsLoading(true);
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
      setError((err as Error).message || 'Failed to refresh interface');
    } finally {
      setIsLoading(false);
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
        'relative min-w-[220px] rounded-lg border shadow-lg transition-all',
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
      {/* Dynamic Input Handles */}
      {inputHandles.map((input, index) => (
        <Handle
          key={input.id}
          type="target"
          position={Position.Left}
          id={input.id}
          className="!w-3 !h-3"
          style={{
            background: HANDLE_COLORS[input.type],
            top: `${((index + 1) / (inputHandles.length + 1)) * 100}%`,
          }}
          title={`${input.label} (${input.type})${input.required ? ' - required' : ''}`}
        />
      ))}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <GitBranch className="h-4 w-4 text-foreground" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {nodeData.label || 'Subworkflow'}
        </span>
        {isProcessing && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {nodeData.status === 'complete' && (
          <CheckCircle2 className="h-4 w-4 text-chart-2" />
        )}
        {nodeData.status === 'error' && (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Workflow Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Referenced Workflow</Label>
          <Select
            value={nodeData.referencedWorkflowId || 'none'}
            onValueChange={handleWorkflowChange}
            disabled={isLoading}
          >
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue placeholder="Select a workflow..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a workflow...</SelectItem>
              {workflows.map((workflow) => (
                <SelectItem key={workflow._id} value={workflow._id}>
                  {workflow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading/Error State */}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
            {error}
          </div>
        )}

        {/* Interface Summary */}
        {hasWorkflow && nodeData.cachedInterface && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">
                Interface
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefreshInterface}
                disabled={isLoading}
                title="Refresh interface"
              >
                <RefreshCw
                  className={clsx('h-3 w-3', isLoading && 'animate-spin')}
                />
              </Button>
            </div>

            {/* Inputs */}
            {nodeData.cachedInterface.inputs.length > 0 && (
              <div className="text-[10px]">
                <span className="text-muted-foreground">Inputs: </span>
                {nodeData.cachedInterface.inputs.map((input, i) => (
                  <span key={input.nodeId}>
                    <span className="text-foreground">
                      {input.name}
                      <span className="text-muted-foreground">
                        :{input.type}
                      </span>
                      {input.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </span>
                    {i < nodeData.cachedInterface?.inputs.length - 1 && ', '}
                  </span>
                ))}
              </div>
            )}

            {/* Outputs */}
            {nodeData.cachedInterface.outputs.length > 0 && (
              <div className="text-[10px]">
                <span className="text-muted-foreground">Outputs: </span>
                {nodeData.cachedInterface.outputs.map((output, i) => (
                  <span key={output.nodeId}>
                    <span className="text-foreground">
                      {output.name}
                      <span className="text-muted-foreground">
                        :{output.type}
                      </span>
                    </span>
                    {i < nodeData.cachedInterface?.outputs.length - 1 && ', '}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No workflows available message */}
        {!isLoading && workflows.length === 0 && (
          <div className="text-[10px] text-muted-foreground text-center py-2">
            No reusable workflows found. Create a workflow with
            WorkflowInput/Output nodes first.
          </div>
        )}

        {/* Child execution info */}
        {nodeData.childExecutionId && (
          <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
            Child execution: {nodeData.childExecutionId.substring(0, 8)}...
          </div>
        )}

        {/* Error message */}
        {nodeData.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
            <p className="text-xs text-destructive">{nodeData.error}</p>
          </div>
        )}
      </div>

      {/* Dynamic Output Handles */}
      {outputHandles.map((output, index) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          className="!w-3 !h-3"
          style={{
            background: HANDLE_COLORS[output.type],
            top: `${((index + 1) / (outputHandles.length + 1)) * 100}%`,
          }}
          title={`${output.label} (${output.type})`}
        />
      ))}
    </div>
  );
}

export const WorkflowRefNode = memo(WorkflowRefNodeComponent);
