'use client';

import { getActionDefinition } from '@genfeedai/actions';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import { X } from 'lucide-react';
import { useCallback } from 'react';
import { ActionSchemaFields } from '../nodes/saas/ActionSchemaFields';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';
import { PanelContainer } from './PanelContainer';

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function ActionNodeInspector() {
  const selectedNodeId = useUIStore((state) => state.selectedNodeId);
  const selectNode = useUIStore((state) => state.selectNode);
  const node = useWorkflowStore((state) =>
    selectedNodeId
      ? state.nodes.find((candidate) => candidate.id === selectedNodeId)
      : undefined,
  );
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const data = readRecord(node?.data);
  const actionId = typeof data.actionId === 'string' ? data.actionId : '';
  const action = getActionDefinition(actionId);
  const parameters = readRecord(data.parameters);

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (!node) return;
      const nextParameters = { ...parameters };
      if (value === undefined || value === '') {
        delete nextParameters[field];
      } else {
        nextParameters[field] = value;
      }
      updateNodeData(node.id, {
        [field]: value,
        parameters: nextParameters,
      });
    },
    [node, parameters, updateNodeData],
  );

  if (String(node?.type) !== 'genfeedAction' || !action) {
    return null;
  }

  return (
    <PanelContainer
      role="complementary"
      aria-label={`${action.label} configuration`}
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {action.label}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        </div>
        <Button
          withWrapper={false}
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          title="Close configuration"
          onClick={() => selectNode(null)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ActionSchemaFields
          schema={action.inputSchema}
          values={parameters}
          onChange={handleChange}
        />
      </div>
    </PanelContainer>
  );
}
