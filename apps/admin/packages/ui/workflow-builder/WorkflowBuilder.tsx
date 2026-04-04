'use client';

import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { AlertCategory } from '@genfeedai/enums';
import { useWorkflowBuilder } from '@hooks/automation/use-workflow-builder/use-workflow-builder';
import type { WorkflowBuilderProps } from '@props/automation/workflow-builder.props';
import Alert from '@ui/feedback/alert/Alert';
import ExecutionHistoryPanel from '@ui/workflow-builder/panels/ExecutionHistoryPanel';
import NodeConfigPanel from '@ui/workflow-builder/panels/NodeConfigPanel';
import NodePalette from '@ui/workflow-builder/panels/NodePalette';
import SchedulePanel from '@ui/workflow-builder/panels/SchedulePanel';
import VariablesPanel from '@ui/workflow-builder/panels/VariablesPanel';
import WorkflowCanvas from '@ui/workflow-builder/WorkflowCanvas';
import WorkflowToolbar from '@ui/workflow-builder/WorkflowToolbar';
import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useState } from 'react';

export default function WorkflowBuilder({
  workflowId,
  initialNodes = [],
  initialEdges = [],
  initialVariables = [],
  onSave,
  isReadOnly = false,
}: WorkflowBuilderProps) {
  const {
    nodes,
    edges,
    inputVariables,
    selectedNodeId,
    isDirty,
    isSaving,
    nodesByCategory,
    isLoading,
    error,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeSelect,
    onAddNode,
    onUpdateNodeConfig,
    onAddVariable,
    onUpdateVariable,
    onDeleteVariable,
    saveWorkflow,
    validateWorkflow,
    runWorkflow,
  } = useWorkflowBuilder({
    initialEdges,
    initialNodes,
    initialVariables,
    workflowId,
  });

  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
  const [isVariablesCollapsed, setIsVariablesCollapsed] = useState(false);
  const [isScheduleCollapsed, setIsScheduleCollapsed] = useState(true);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);
  const [workflowSchedule, _setWorkflowSchedule] = useState<
    string | undefined
  >();
  const [workflowTimezone, _setWorkflowTimezone] = useState<string>('UTC');
  const [isScheduleEnabled, _setIsScheduleEnabled] = useState(false);

  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: string) => {
      event.dataTransfer.setData('application/workflow-node', nodeType);
      event.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent, position: { x: number; y: number }) => {
      const nodeType = event.dataTransfer.getData('application/workflow-node');
      if (nodeType) {
        onAddNode(nodeType, position);
      }
    },
    [onAddNode],
  );

  const handleSave = useCallback(async () => {
    if (onSave) {
      const workflowNodes: WorkflowVisualNode[] = nodes.map((node) => ({
        data: {
          config: node.data.config,
          inputVariableKeys: node.data.inputVariableKeys,
          label: node.data.label,
          nodeType: node.data.nodeType,
        },
        id: node.id,
        position: node.position,
        type: node.data.nodeType,
      }));
      const workflowEdges: WorkflowEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle || undefined,
        target: edge.target,
        targetHandle: edge.targetHandle || undefined,
      }));
      await onSave({
        edges: workflowEdges,
        inputVariables,
        nodes: workflowNodes,
      });
    } else {
      await saveWorkflow();
    }
  }, [nodes, edges, inputVariables, onSave, saveWorkflow]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) || null
    : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <Alert type={AlertCategory.ERROR} className="max-w-md">
          Error loading workflow builder: {error}
        </Alert>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <WorkflowToolbar
          workflowId={workflowId}
          workflowLabel="Workflow"
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          onValidate={validateWorkflow}
          onRun={runWorkflow}
          onSchedule={() => setIsScheduleCollapsed(false)}
          onHistory={() => setIsHistoryCollapsed(false)}
          isReadOnly={isReadOnly}
        />
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Node Palette */}
          <div
            className={`border-r border-white/[0.08] bg-background transition-all duration-300 ${
              isPaletteCollapsed ? 'w-12' : 'w-64'
            }`}
          >
            <NodePalette
              nodesByCategory={nodesByCategory}
              onDragStart={handleDragStart}
              isCollapsed={isPaletteCollapsed}
              onToggleCollapse={() =>
                setIsPaletteCollapsed(!isPaletteCollapsed)
              }
            />
          </div>

          {/* Center - Canvas */}
          <div className="flex-1">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeSelect={onNodeSelect}
              onDrop={handleDrop}
              isReadOnly={isReadOnly}
            />
          </div>

          {/* Right Panel - Config + Variables + Schedule + History */}
          <div className="flex w-80 flex-col border-l border-white/[0.08] bg-card">
            {selectedNode && (
              <NodeConfigPanel
                selectedNode={selectedNode}
                onUpdateConfig={onUpdateNodeConfig}
                inputVariables={inputVariables}
                onClose={() => onNodeSelect(null)}
              />
            )}
            <div className="flex-1 overflow-auto">
              <VariablesPanel
                variables={inputVariables}
                onAdd={onAddVariable}
                onUpdate={onUpdateVariable}
                onDelete={onDeleteVariable}
                isCollapsed={isVariablesCollapsed}
                onToggleCollapse={() =>
                  setIsVariablesCollapsed(!isVariablesCollapsed)
                }
              />
              <SchedulePanel
                workflowId={workflowId}
                currentSchedule={workflowSchedule}
                currentTimezone={workflowTimezone}
                isEnabled={isScheduleEnabled}
                onScheduleUpdate={() => {
                  // Refetch workflow to get updated schedule
                }}
                isCollapsed={isScheduleCollapsed}
                onToggleCollapse={() =>
                  setIsScheduleCollapsed(!isScheduleCollapsed)
                }
              />
              <ExecutionHistoryPanel
                workflowId={workflowId}
                isCollapsed={isHistoryCollapsed}
                onToggleCollapse={() =>
                  setIsHistoryCollapsed(!isHistoryCollapsed)
                }
              />
            </div>
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
