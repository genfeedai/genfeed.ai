'use client';

import { LUMA_ASPECT_RATIOS } from '@genfeedai/core';
import type {
  GridPosition,
  LumaAspectRatio,
  ResizeNodeData,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { ImageIcon, Loader2, RefreshCw, Video } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { GridPositionSelector } from '../../ui/grid-position-selector';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BaseNode } from '../BaseNode';

type MediaType = 'image' | 'video';

const MODELS: Record<MediaType, { id: string; label: string; price: string }> =
  {
    image: { id: 'photon-flash-1', label: 'Luma Photon Flash', price: '$0.01' },
    video: { id: 'luma-reframe', label: 'Luma Reframe', price: '$0.05' },
  };

function ResizeNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as ResizeNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);

  const mediaType = nodeData.inputType ?? 'image';
  const currentModel = MODELS[mediaType];

  const handleTypeChange = useCallback(
    (value: string) => {
      updateNodeData<ResizeNodeData>(id, {
        inputType: value as MediaType,
      });
    },
    [id, updateNodeData],
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNodeData<ResizeNodeData>(id, {
        targetAspectRatio: value as LumaAspectRatio,
      });
    },
    [id, updateNodeData],
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<ResizeNodeData>(id, { prompt: e.target.value });
    },
    [id, updateNodeData],
  );

  const handlePositionChange = useCallback(
    (position: GridPosition) => {
      updateNodeData<ResizeNodeData>(id, { gridPosition: position });
    },
    [id, updateNodeData],
  );

  const handleProcess = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  return (
    <BaseNode {...props}>
      <div className="flex flex-col gap-3">
        {/* Media Type Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs">Media Type</Label>
          <Select value={mediaType} onValueChange={handleTypeChange}>
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="video">Video</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Model Display */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/50 text-xs text-muted-foreground">
          {mediaType === 'image' ? (
            <ImageIcon className="h-3.5 w-3.5" />
          ) : (
            <Video className="h-3.5 w-3.5" />
          )}
          <span className="flex-1">{currentModel.label}</span>
          <span>{currentModel.price}</span>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-1.5">
          <Label className="text-xs">Target Aspect Ratio</Label>
          <Select
            value={nodeData.targetAspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LUMA_ASPECT_RATIOS.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid Position */}
        <GridPositionSelector
          position={nodeData.gridPosition}
          onPositionChange={handlePositionChange}
        />

        {/* Optional Prompt */}
        <div className="space-y-1.5">
          <Label className="text-xs">Prompt (optional)</Label>
          <input
            type="text"
            value={nodeData.prompt}
            onChange={handlePromptChange}
            placeholder="Guide the AI outpainting..."
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Output Preview */}
        {nodeData.outputMedia && (
          <div className="relative mt-1">
            {mediaType === 'video' ? (
              <video
                src={nodeData.outputMedia}
                className="h-32 w-full rounded-md object-cover"
                controls
              />
            ) : (
              <Image
                src={nodeData.outputMedia}
                alt="Resized media"
                width={200}
                height={128}
                className="h-32 w-full rounded-md object-cover"
                unoptimized
              />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleProcess}
              disabled={nodeData.status === 'processing'}
              className="absolute right-2 top-2 h-6 w-6 bg-black/50 hover:bg-black/70"
            >
              <RefreshCw className="h-3.5 w-3.5 text-white" />
            </Button>
          </div>
        )}

        {/* Process Button */}
        {!nodeData.outputMedia && (
          <Button
            variant="default"
            size="sm"
            onClick={handleProcess}
            disabled={!nodeData.inputMedia || nodeData.status === 'processing'}
            className="mt-1 w-full"
          >
            {nodeData.status === 'processing' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {nodeData.status === 'processing'
              ? 'Resizing...'
              : `Resize ${mediaType === 'video' ? 'Video' : 'Image'}`}
          </Button>
        )}
      </div>
    </BaseNode>
  );
}

export const ResizeNode = memo(ResizeNodeComponent);
