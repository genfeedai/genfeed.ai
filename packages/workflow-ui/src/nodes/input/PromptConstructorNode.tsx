'use client';

import type {
  AvailableVariable,
  PromptConstructorNodeData,
  PromptNodeData,
} from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Expand } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePromptAutocomplete } from '../../hooks/usePromptAutocomplete';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function PromptConstructorNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as PromptConstructorNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);

  // Local state for template to prevent cursor jumping
  const [localTemplate, setLocalTemplate] = useState(nodeData.template);
  const [isEditing, setIsEditing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalTemplate(nodeData.template);
    }
  }, [nodeData.template, isEditing]);

  // Get available variables from connected prompt nodes
  const availableVariables = useMemo((): AvailableVariable[] => {
    const connectedPromptNodes = edges
      .filter((e) => e.target === id && e.targetHandle === 'text')
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter(
        (n): n is (typeof nodes)[0] => n !== undefined && n.type === 'prompt',
      );

    const vars: AvailableVariable[] = [];
    connectedPromptNodes.forEach((promptNode) => {
      const promptData = promptNode.data as PromptNodeData;
      const variableName = (promptData as Record<string, unknown>)
        .variableName as string | undefined;
      if (variableName) {
        vars.push({
          name: variableName,
          nodeId: promptNode.id,
          value: promptData.prompt || '',
        });
      }
    });

    return vars;
  }, [edges, nodes, id]);

  // Autocomplete via shared hook
  const {
    showAutocomplete,
    autocompletePosition,
    filteredAutocompleteVars,
    selectedAutocompleteIndex,
    handleChange,
    handleKeyDown,
    handleAutocompleteSelect,
    closeAutocomplete,
  } = usePromptAutocomplete({
    availableVariables,
    localTemplate,
    onTemplateCommit: (newTemplate) =>
      updateNodeData<PromptConstructorNodeData>(id, { template: newTemplate }),
    setLocalTemplate,
    textareaRef,
  });

  // Compute unresolved variables client-side
  const unresolvedVars = useMemo(() => {
    const varPattern = /@(\w+)/g;
    const unresolved: string[] = [];
    const matches = localTemplate.matchAll(varPattern);
    const availableNames = new Set(availableVariables.map((v) => v.name));

    for (const match of matches) {
      const varName = match[1];
      if (!availableNames.has(varName) && !unresolved.includes(varName)) {
        unresolved.push(varName);
      }
    }

    return unresolved;
  }, [localTemplate, availableVariables]);

  // Compute resolved text client-side for preview
  const resolvedPreview = useMemo(() => {
    let resolved = localTemplate;
    availableVariables.forEach((v) => {
      resolved = resolved.replace(new RegExp(`@${v.name}`, 'g'), v.value);
    });
    return resolved;
  }, [localTemplate, availableVariables]);

  // Sync resolved text to outputText so downstream nodes can read it before execution
  useEffect(() => {
    let resolved = nodeData.template;
    availableVariables.forEach((v) => {
      resolved = resolved.replace(new RegExp(`@${v.name}`, 'g'), v.value);
    });
    const outputValue = resolved || null;
    if (outputValue !== nodeData.outputText) {
      updateNodeData<PromptConstructorNodeData>(id, {
        outputText: outputValue,
      });
    }
  }, [
    nodeData.template,
    availableVariables,
    id,
    updateNodeData,
    nodeData.outputText,
  ]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localTemplate !== nodeData.template) {
      updateNodeData<PromptConstructorNodeData>(id, {
        template: localTemplate,
      });
    }
    setTimeout(() => closeAutocomplete(), 200);
  }, [id, localTemplate, nodeData.template, updateNodeData, closeAutocomplete]);

  const headerActions = (
    <Button variant="ghost" size="icon-sm" title="Expand editor">
      <Expand className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="relative flex flex-col gap-2 flex-1">
        {/* Warning badge for unresolved variables */}
        {unresolvedVars.length > 0 && (
          <div className="px-2 py-1 bg-amber-900/30 border border-amber-700/50 rounded text-[10px] text-amber-400">
            <span className="font-semibold">Unresolved:</span>{' '}
            {unresolvedVars.map((v) => `@${v}`).join(', ')}
          </div>
        )}

        {/* Template textarea with autocomplete */}
        <div className="relative flex-1 flex flex-col">
          <textarea
            ref={textareaRef}
            value={localTemplate}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Type @ to insert variables..."
            className="nodrag nopan nowheel w-full flex-1 min-h-[70px] px-2 py-1.5 text-sm bg-background border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            title={resolvedPreview ? `Preview: ${resolvedPreview}` : undefined}
          />

          {/* Autocomplete dropdown */}
          {showAutocomplete && filteredAutocompleteVars.length > 0 && (
            <div
              className="absolute z-10 bg-popover border border-border rounded shadow-xl max-h-40 overflow-y-auto"
              style={{
                left: autocompletePosition.left,
                top: autocompletePosition.top,
              }}
            >
              {filteredAutocompleteVars.map((variable, index) => (
                <button
                  key={variable.nodeId}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAutocompleteSelect(variable.name);
                  }}
                  className={`w-full px-3 py-2 text-left text-[11px] flex flex-col gap-0.5 transition-colors ${
                    index === selectedAutocompleteIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <div className="font-medium text-primary">
                    @{variable.name}
                  </div>
                  <div className="text-muted-foreground truncate max-w-[200px]">
                    {variable.value || '(empty)'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Available variables info */}
        {availableVariables.length > 0 && (
          <div className="text-[10px] text-muted-foreground px-2">
            Available: {availableVariables.map((v) => `@${v.name}`).join(', ')}
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const PromptConstructorNode = memo(PromptConstructorNodeComponent);
