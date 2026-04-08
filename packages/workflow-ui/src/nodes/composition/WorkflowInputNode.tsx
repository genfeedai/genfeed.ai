'use client';

import type { HandleType, WorkflowInputNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BaseNode } from '../BaseNode';

const INPUT_TYPES: { value: HandleType; label: string }[] = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Text', value: 'text' },
  { label: 'Audio', value: 'audio' },
  { label: 'Number', value: 'number' },
];

function WorkflowInputNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as WorkflowInputNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<WorkflowInputNodeData>(id, {
        inputName: e.target.value,
        label: `Input: ${e.target.value}`,
      });
    },
    [id, updateNodeData],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      updateNodeData<WorkflowInputNodeData>(id, {
        inputType: value as HandleType,
      });
    },
    [id, updateNodeData],
  );

  const handleRequiredChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<WorkflowInputNodeData>(id, {
          required: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<WorkflowInputNodeData>(id, {
        description: e.target.value,
      });
    },
    [id, updateNodeData],
  );

  return (
    <BaseNode {...props}>
      <div className="flex flex-col gap-3">
        <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 text-center">
          Defines an input port when this workflow is used as a subworkflow
        </div>

        {/* Input Name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Input Name</Label>
          <input
            type="text"
            value={nodeData.inputName || 'input'}
            onChange={handleNameChange}
            placeholder="Enter input name..."
            className="flex h-9 w-full border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Input Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Data Type</Label>
          <Select
            value={nodeData.inputType || 'image'}
            onValueChange={handleTypeChange}
          >
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INPUT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Required Checkbox */}
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`required-${id}`}
            checked={nodeData.required ?? true}
            onCheckedChange={handleRequiredChange}
          />
          <Label htmlFor={`required-${id}`} className="text-xs cursor-pointer">
            Required input
          </Label>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <input
            type="text"
            value={nodeData.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Describe this input..."
            className="flex h-9 w-full border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Current Type Indicator */}
        <div className="mt-1 text-[10px] text-muted-foreground text-center">
          Output type:{' '}
          <span className="font-medium capitalize">
            {nodeData.inputType || 'image'}
          </span>
        </div>
      </div>
    </BaseNode>
  );
}

export const WorkflowInputNode = memo(WorkflowInputNodeComponent);
