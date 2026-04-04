'use client';

import type { HandleType, WorkflowOutputNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import Image from 'next/image';
import { memo, useCallback, useRef, useState } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BaseNode } from '../BaseNode';

const OUTPUT_TYPES: { value: HandleType; label: string }[] = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Text', value: 'text' },
  { label: 'Audio', value: 'audio' },
  { label: 'Number', value: 'number' },
];

function WorkflowOutputNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as WorkflowOutputNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<WorkflowOutputNodeData>(id, {
        label: `Output: ${e.target.value}`,
        outputName: e.target.value,
      });
    },
    [id, updateNodeData],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      updateNodeData<WorkflowOutputNodeData>(id, {
        outputType: value as HandleType,
      });
    },
    [id, updateNodeData],
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<WorkflowOutputNodeData>(id, {
        description: e.target.value,
      });
    },
    [id, updateNodeData],
  );

  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const outputType = nodeData.outputType || 'image';
  const hasValue = !!nodeData.inputValue;

  return (
    <BaseNode {...props}>
      <div className="flex flex-col gap-3">
        <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 text-center">
          Defines an output port when this workflow is used as a subworkflow
        </div>

        {/* Output Name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Output Name</Label>
          <input
            type="text"
            value={nodeData.outputName || 'output'}
            onChange={handleNameChange}
            placeholder="Enter output name..."
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Output Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Data Type</Label>
          <Select value={outputType} onValueChange={handleTypeChange}>
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <input
            type="text"
            value={nodeData.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Describe this output..."
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Preview of connected value */}
        {hasValue && (
          <div className="mt-1">
            <Label className="text-xs text-muted-foreground">
              Connected Value:
            </Label>
            {outputType === 'image' && (
              <Image
                src={nodeData.inputValue as string}
                alt="Output preview"
                width={200}
                height={128}
                className="mt-1 h-24 w-full rounded-md object-cover"
                unoptimized
              />
            )}
            {outputType === 'video' && (
              <video
                ref={videoRef}
                src={nodeData.inputValue as string}
                className="mt-1 h-24 w-full rounded-md object-cover cursor-pointer"
                onClick={togglePlayback}
                onEnded={() => setIsPlaying(false)}
                loop
                muted
              />
            )}
            {outputType === 'text' && (
              <div className="mt-1 p-2 bg-secondary/50 rounded text-xs max-h-20 overflow-auto">
                {String(nodeData.inputValue).substring(0, 200)}
                {String(nodeData.inputValue).length > 200 && '...'}
              </div>
            )}
            {outputType === 'audio' && (
              <audio
                src={nodeData.inputValue as string}
                controls
                className="mt-1 w-full h-8"
              />
            )}
            {outputType === 'number' && (
              <div className="mt-1 p-2 bg-secondary/50 rounded text-sm font-mono">
                {String(nodeData.inputValue)}
              </div>
            )}
          </div>
        )}

        {!hasValue && (
          <div className="mt-1 text-[10px] text-muted-foreground text-center">
            Connect an input to define the workflow output
          </div>
        )}

        {/* Current Type Indicator */}
        <div className="text-[10px] text-muted-foreground text-center">
          Input type:{' '}
          <span className="font-medium capitalize">{outputType}</span>
        </div>
      </div>
    </BaseNode>
  );
}

export const WorkflowOutputNode = memo(WorkflowOutputNodeComponent);
