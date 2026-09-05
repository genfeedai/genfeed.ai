'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  GridPosition,
  LumaAspectRatio,
  ResizeNodeData,
} from '@genfeedai/contracts/types';
import { NodeStatusEnum } from '@genfeedai/contracts/types';
import { LUMA_ASPECT_RATIOS } from '@genfeedai/pricing';
import { Button } from '@genfeedai/ui/primitives/button';
import { Input } from '@genfeedai/ui/primitives/input';
import { Label } from '@genfeedai/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genfeedai/ui/primitives/select';
import type { NodeProps } from '@xyflow/react';
import { ImageIcon, LoaderCircle, RefreshCw, Video } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/execution';
import { useWorkflowStore } from '../../stores/workflow';
import { GridPositionSelector } from '../../ui/grid-position-selector';
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
          <Label className="text-xs" id={`resize-media-type-${id}`}>
            Media Type
          </Label>
          <Select value={mediaType} onValueChange={handleTypeChange}>
            <SelectTrigger
              aria-labelledby={`resize-media-type-${id}`}
              className="nodrag h-9 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="video">Video</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Model Display */}
        <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary/50 text-xs text-muted-foreground">
          {mediaType === 'image' ? (
            <ImageIcon className="size-3.5" />
          ) : (
            <Video className="size-3.5" />
          )}
          <span className="flex-1">{currentModel.label}</span>
          <span>{currentModel.price}</span>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-1.5">
          <Label className="text-xs" id={`resize-aspect-ratio-${id}`}>
            Target Aspect Ratio
          </Label>
          <Select
            value={nodeData.targetAspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger
              aria-labelledby={`resize-aspect-ratio-${id}`}
              className="nodrag h-9 w-full"
            >
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
          <Label htmlFor={`resize-prompt-${id}`} className="text-xs">
            Prompt (optional)
          </Label>
          <Input
            aria-label="Resize prompt"
            id={`resize-prompt-${id}`}
            type="text"
            value={nodeData.prompt}
            onChange={handlePromptChange}
            placeholder="Guide the AI outpainting..."
            className="flex h-9 w-full border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Output Preview */}
        {nodeData.outputMedia && (
          <div className="relative mt-1">
            {mediaType === 'video' ? (
              <video
                src={nodeData.outputMedia}
                aria-label="Resized video output"
                className="h-32 w-full rounded-md object-cover"
                controls
              >
                <track kind="captions" />
              </video>
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
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={handleProcess}
              disabled={nodeData.status === 'processing'}
              className={
                'absolute right-2 top-2 size-6 bg-black/50 hover:bg-black/70' /* design-system-allow-content-color */
              }
            >
              <RefreshCw
                className={
                  'size-3.5 text-white' /* design-system-allow-content-color */
                }
              />
            </Button>
          </div>
        )}

        {/* Process Button */}
        {!nodeData.outputMedia && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleProcess}
            disabled={!nodeData.inputMedia || nodeData.status === 'processing'}
            className="mt-1 w-full"
          >
            {nodeData.status === 'processing' && (
              <LoaderCircle className="size-4 animate-spin" />
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
