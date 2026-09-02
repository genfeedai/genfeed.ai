'use client';

import type {
  AvailableVariable,
  PromptConstructorNodeData,
  PromptFormat,
  PromptNodeData,
} from '@genfeedai/contracts/types';
import { Textarea, ToggleGroup, ToggleGroupItem } from '@genfeedai/ui';
import type { NodeProps } from '@xyflow/react';
import { Braces, Expand, Type } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPromptJsonWarning,
  PROMPT_FORMAT_JSON,
  PROMPT_FORMAT_TEXT,
  parsePromptJson,
} from '../../../engine/executors/saas/prompt-json';
import { usePromptAutocomplete } from '../../hooks/usePromptAutocomplete';
import { useWorkflowStore } from '../../stores/workflow';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

const PROMPT_CONSTRUCTOR_HEADER_ACTIONS = (
  <Button variant="ghost" size="icon-sm" title="Expand editor">
    <Expand className="size-3.5" />
  </Button>
);

function PromptConstructorNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as PromptConstructorNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const promptFormat: PromptFormat =
    nodeData.promptFormat === PROMPT_FORMAT_JSON
      ? PROMPT_FORMAT_JSON
      : PROMPT_FORMAT_TEXT;
  const isJsonMode = promptFormat === PROMPT_FORMAT_JSON;

  // Local state for template to prevent cursor jumping
  const [localTemplate, setLocalTemplate] = useState(nodeData.template);
  const isEditingRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Deferred work that must not outlive the node: both callbacks below set state
  // after a delay, so an unmount inside that window would touch a dead tree.
  const closeAutocompleteTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pasteReformatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (closeAutocompleteTimeoutRef.current) {
        clearTimeout(closeAutocompleteTimeoutRef.current);
      }
      if (pasteReformatTimeoutRef.current) {
        clearTimeout(pasteReformatTimeoutRef.current);
      }
    };
  }, []);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTemplate(nodeData.template);
    }
  }, [nodeData.template]);

  // Get available variables from connected prompt nodes
  const availableVariables = useMemo((): AvailableVariable[] => {
    const vars: AvailableVariable[] = [];
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    for (const edge of edges) {
      if (edge.target !== id || edge.targetHandle !== 'text') continue;

      const promptNode = nodesById.get(edge.source);
      if (!promptNode || promptNode.type !== 'prompt') continue;

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
    }

    return vars;
  }, [edges, nodes, id]);

  // Autocomplete via shared hook
  const {
    showAutocomplete,
    autocompletePosition,
    filteredAutocompleteVars,
    selectedAutocompleteIndex,
    handleChange: handleTemplateChange,
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
    const unresolvedNames = new Set<string>();
    const matches = localTemplate.matchAll(varPattern);
    const availableNames = new Set(availableVariables.map((v) => v.name));

    for (const match of matches) {
      const varName = match[1];
      if (!availableNames.has(varName) && !unresolvedNames.has(varName)) {
        unresolvedNames.add(varName);
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

  const jsonWarning = isJsonMode ? getPromptJsonWarning(localTemplate) : null;

  const startTemplateEditing = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  const commitJsonTemplate = useCallback(
    (template: string) => {
      const parsed = parsePromptJson(template);
      const nextTemplate = parsed.isValid ? parsed.pretty : template;
      const nextStructured = parsed.isValid ? parsed.value : null;

      if (parsed.isValid && nextTemplate !== localTemplate) {
        setLocalTemplate(nextTemplate);
      }

      const hasTemplateChanged = nextTemplate !== nodeData.template;
      const hasFormatChanged = nodeData.promptFormat !== PROMPT_FORMAT_JSON;
      const hasStructuredChanged =
        JSON.stringify(nodeData.structuredPrompt ?? null) !==
        JSON.stringify(nextStructured);

      if (!hasTemplateChanged && !hasFormatChanged && !hasStructuredChanged) {
        return;
      }

      updateNodeData<PromptConstructorNodeData>(id, {
        promptFormat: PROMPT_FORMAT_JSON,
        structuredPrompt: nextStructured,
        template: nextTemplate,
      });
    },
    [
      id,
      localTemplate,
      nodeData.promptFormat,
      nodeData.structuredPrompt,
      nodeData.template,
      updateNodeData,
    ],
  );

  const commitTemplateEditing = useCallback(() => {
    isEditingRef.current = false;
    if (isJsonMode) {
      commitJsonTemplate(localTemplate);
    } else if (localTemplate !== nodeData.template) {
      updateNodeData<PromptConstructorNodeData>(id, {
        template: localTemplate,
      });
    }
    // Held so a blur immediately followed by unmount cannot close a gone popover.
    if (closeAutocompleteTimeoutRef.current) {
      clearTimeout(closeAutocompleteTimeoutRef.current);
    }
    closeAutocompleteTimeoutRef.current = setTimeout(() => {
      closeAutocompleteTimeoutRef.current = null;
      closeAutocomplete();
    }, 200);
  }, [
    closeAutocomplete,
    commitJsonTemplate,
    id,
    isJsonMode,
    localTemplate,
    nodeData.template,
    updateNodeData,
  ]);

  const handleFormatChange = useCallback(
    (value: string) => {
      if (value !== PROMPT_FORMAT_TEXT && value !== PROMPT_FORMAT_JSON) {
        return;
      }

      if (value === PROMPT_FORMAT_TEXT) {
        updateNodeData<PromptConstructorNodeData>(id, {
          promptFormat: PROMPT_FORMAT_TEXT,
          structuredPrompt: null,
        });
        return;
      }

      commitJsonTemplate(localTemplate);
    },
    [commitJsonTemplate, id, localTemplate, updateNodeData],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!isJsonMode) {
        return;
      }

      const pasted = event.clipboardData.getData('text');
      if (pasteReformatTimeoutRef.current) {
        clearTimeout(pasteReformatTimeoutRef.current);
      }
      // Deferred a tick so the textarea holds the pasted text before reformatting.
      pasteReformatTimeoutRef.current = setTimeout(() => {
        pasteReformatTimeoutRef.current = null;
        const nextValue = textareaRef.current?.value || pasted;
        const parsed = parsePromptJson(nextValue);
        if (parsed.isValid) {
          setLocalTemplate(parsed.pretty);
        }
      }, 0);
    },
    [isJsonMode],
  );

  return (
    <BaseNode {...props} headerActions={PROMPT_CONSTRUCTOR_HEADER_ACTIONS}>
      <div className="relative flex flex-col gap-2 flex-1">
        <ToggleGroup
          aria-label="Prompt format"
          className="justify-start gap-0.5"
          onValueChange={handleFormatChange}
          size="sm"
          type="single"
          value={promptFormat}
          variant="outline"
        >
          <ToggleGroupItem
            aria-label="Text"
            className="h-7 min-w-7 px-1.5"
            title="Text"
            value={PROMPT_FORMAT_TEXT}
          >
            <Type />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="JSON"
            className="h-7 min-w-7 px-1.5"
            title="JSON"
            value={PROMPT_FORMAT_JSON}
          >
            <Braces />
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Warning badge for unresolved variables */}
        {unresolvedVars.length > 0 && (
          <div className="px-2 py-1 bg-warning/10 border border-warning/30 rounded text-2xs text-warning">
            <span className="font-semibold">Unresolved:</span>{' '}
            {unresolvedVars.map((v) => `@${v}`).join(', ')}
          </div>
        )}

        {jsonWarning ? (
          <div
            className="px-2 py-1 bg-warning/10 border border-warning/30 rounded text-2xs text-warning"
            data-testid="json-warning"
          >
            {jsonWarning}
          </div>
        ) : null}

        {/* Template textarea with autocomplete */}
        <div className="relative flex-1 flex flex-col">
          <Textarea
            ref={textareaRef}
            value={localTemplate}
            onChange={handleTemplateChange}
            onFocus={startTemplateEditing}
            onBlur={commitTemplateEditing}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isJsonMode
                ? '{"scene":"","camera":""}'
                : 'Type @ to insert variables...'
            }
            className={`nodrag nopan nowheel w-full flex-1 min-h-[70px] resize-none${
              isJsonMode ? ' font-mono' : ''
            }`}
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
                <Button
                  key={variable.nodeId}
                  variant="ghost"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAutocompleteSelect(variable.name);
                  }}
                  className={`w-full px-3 py-2 text-left text-2xs flex flex-col gap-0.5 h-auto items-start ${
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
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Available variables info */}
        {availableVariables.length > 0 && (
          <div className="text-2xs text-muted-foreground px-2">
            Available: {availableVariables.map((v) => `@${v.name}`).join(', ')}
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const PromptConstructorNode = memo(PromptConstructorNodeComponent);
