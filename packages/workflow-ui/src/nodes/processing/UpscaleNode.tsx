'use client';

import type {
  TopazUpscaleFactor,
  TopazVideoFPS,
  TopazVideoResolution,
  UpscaleModel,
  UpscaleNodeData,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import {
  Expand,
  Loader2,
  RefreshCw,
  SplitSquareHorizontal,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { ComparisonSlider } from '../../ui/comparison-slider';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

// Image upscale models
const IMAGE_MODELS: { value: UpscaleModel; label: string }[] = [
  { label: 'Standard V2', value: 'topaz-standard-v2' },
  { label: 'Low Resolution V2', value: 'topaz-low-res-v2' },
  { label: 'CGI', value: 'topaz-cgi' },
  { label: 'High Fidelity V2', value: 'topaz-high-fidelity-v2' },
  { label: 'Text Refine', value: 'topaz-text-refine' },
];

// Video model (only one option currently)
const VIDEO_MODELS: { value: UpscaleModel; label: string }[] = [
  { label: 'Topaz Video Upscale', value: 'topaz-video' },
];

const UPSCALE_FACTORS: { value: TopazUpscaleFactor; label: string }[] = [
  { label: 'None (enhance only)', value: 'None' },
  { label: '2x', value: '2x' },
  { label: '4x', value: '4x' },
  { label: '6x', value: '6x' },
];

const RESOLUTIONS: { value: TopazVideoResolution; label: string }[] = [
  { label: '720p (HD)', value: '720p' },
  { label: '1080p (Full HD)', value: '1080p' },
  { label: '4K (Ultra HD)', value: '4k' },
];

const FPS_OPTIONS: { value: TopazVideoFPS; label: string }[] = [
  { label: '15 fps', value: 15 },
  { label: '24 fps (Film)', value: 24 },
  { label: '30 fps', value: 30 },
  { label: '60 fps (Smooth)', value: 60 },
];

function UpscaleNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as UpscaleNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Determine input type based on what's connected
  const inputType =
    nodeData.inputType ??
    (nodeData.inputImage ? 'image' : nodeData.inputVideo ? 'video' : null);
  const hasInput = inputType !== null;
  const hasOutput =
    inputType === 'image' ? !!nodeData.outputImage : !!nodeData.outputVideo;

  const handleModelChange = useCallback(
    (value: string) => {
      updateNodeData<UpscaleNodeData>(id, { model: value as UpscaleModel });
    },
    [id, updateNodeData],
  );
  const handleFactorChange = useCallback(
    (value: string) => {
      updateNodeData<UpscaleNodeData>(id, {
        upscaleFactor: value as TopazUpscaleFactor,
      });
    },
    [id, updateNodeData],
  );
  const handleFormatChange = useCallback(
    (value: string) => {
      updateNodeData<UpscaleNodeData>(id, {
        outputFormat: value as 'jpg' | 'png',
      });
    },
    [id, updateNodeData],
  );
  const handleResolutionChange = useCallback(
    (value: string) => {
      updateNodeData<UpscaleNodeData>(id, {
        targetResolution: value as TopazVideoResolution,
      });
    },
    [id, updateNodeData],
  );
  const handleFpsChange = useCallback(
    (value: string) => {
      updateNodeData<UpscaleNodeData>(id, {
        targetFps: Number.parseInt(value, 10) as TopazVideoFPS,
      });
    },
    [id, updateNodeData],
  );

  const handleFaceEnhancementToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<UpscaleNodeData>(id, {
          faceEnhancement: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleStrengthChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<UpscaleNodeData>(id, {
        faceEnhancementStrength: value,
      });
    },
    [id, updateNodeData],
  );

  const handleCreativityChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<UpscaleNodeData>(id, {
        faceEnhancementCreativity: value,
      });
    },
    [id, updateNodeData],
  );

  const handleComparisonToggle = useCallback(() => {
    updateNodeData<UpscaleNodeData>(id, {
      showComparison: !nodeData.showComparison,
    });
  }, [id, nodeData.showComparison, updateNodeData]);

  const handleComparisonPositionChange = useCallback(
    (position: number) => {
      updateNodeData<UpscaleNodeData>(id, { comparisonPosition: position });
    },
    [id, updateNodeData],
  );

  const handleProcess = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Estimate pricing based on resolution and fps (video only)
  const getPriceEstimate = useCallback(() => {
    const priceMap: Record<string, number> = {
      '4k-15': 0.187,
      '4k-24': 0.299,
      '4k-30': 0.373,
      '4k-60': 0.747,
      '720p-15': 0.014,
      '720p-24': 0.022,
      '720p-30': 0.027,
      '720p-60': 0.054,
      '1080p-15': 0.051,
      '1080p-24': 0.081,
      '1080p-30': 0.101,
      '1080p-60': 0.203,
    };
    const key = `${nodeData.targetResolution}-${nodeData.targetFps}`;
    const perFiveSeconds = priceMap[key] ?? 0.101;
    return `~$${perFiveSeconds.toFixed(3)}/5s`;
  }, [nodeData.targetResolution, nodeData.targetFps]);

  const models = inputType === 'video' ? VIDEO_MODELS : IMAGE_MODELS;

  const headerActions = useMemo(
    () =>
      hasOutput ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="h-3 w-3" />
        </Button>
      ) : null,
    [hasOutput, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="flex flex-col gap-3">
        {/* Input Type Indicator */}
        {!hasInput && (
          <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 text-center">
            Connect an image or video input
          </div>
        )}

        {hasInput && (
          <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
            Mode: <span className="font-medium capitalize">{inputType}</span>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs">Model</Label>
          <Select value={nodeData.model} onValueChange={handleModelChange}>
            <SelectTrigger className="nodrag h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Image-specific controls */}
        {inputType === 'image' && (
          <>
            {/* Upscale Factor */}
            <div className="space-y-1.5">
              <Label className="text-xs">Upscale Factor</Label>
              <Select
                value={nodeData.upscaleFactor}
                onValueChange={handleFactorChange}
              >
                <SelectTrigger className="nodrag h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPSCALE_FACTORS.map((factor) => (
                    <SelectItem key={factor.value} value={factor.value}>
                      {factor.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Output Format */}
            <div className="space-y-1.5">
              <Label className="text-xs">Output Format</Label>
              <Select
                value={nodeData.outputFormat}
                onValueChange={handleFormatChange}
              >
                <SelectTrigger className="nodrag h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPG</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Face Enhancement */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 nodrag">
                <Checkbox
                  id={`${id}-face-enhance`}
                  checked={nodeData.faceEnhancement}
                  onCheckedChange={handleFaceEnhancementToggle}
                />
                <Label
                  htmlFor={`${id}-face-enhance`}
                  className="text-xs cursor-pointer"
                >
                  Face Enhancement
                </Label>
              </div>

              {nodeData.faceEnhancement && (
                <div className="space-y-2 pl-1">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-[10px]">Strength</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {nodeData.faceEnhancementStrength}%
                      </span>
                    </div>
                    <Slider
                      value={[nodeData.faceEnhancementStrength]}
                      min={0}
                      max={100}
                      onValueChange={handleStrengthChange}
                      className="nodrag w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-[10px]">Creativity</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {nodeData.faceEnhancementCreativity}%
                      </span>
                    </div>
                    <Slider
                      value={[nodeData.faceEnhancementCreativity]}
                      min={0}
                      max={100}
                      onValueChange={handleCreativityChange}
                      className="nodrag w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Video-specific controls */}
        {inputType === 'video' && (
          <>
            {/* Target Resolution */}
            <div className="space-y-1.5">
              <Label className="text-xs">Target Resolution</Label>
              <Select
                value={nodeData.targetResolution}
                onValueChange={handleResolutionChange}
              >
                <SelectTrigger className="nodrag h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((res) => (
                    <SelectItem key={res.value} value={res.value}>
                      {res.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target FPS */}
            <div className="space-y-1.5">
              <Label className="text-xs">Target Frame Rate</Label>
              <Select
                value={String(nodeData.targetFps)}
                onValueChange={handleFpsChange}
              >
                <SelectTrigger className="nodrag h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FPS_OPTIONS.map((fps) => (
                    <SelectItem key={fps.value} value={String(fps.value)}>
                      {fps.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pricing Notice */}
            <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
              Estimated cost: {getPriceEstimate()}
            </div>
          </>
        )}

        {/* Output with Comparison - Image */}
        {inputType === 'image' && nodeData.outputImage && (
          <div className="mt-1">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Result</Label>
              {nodeData.originalPreview && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleComparisonToggle}
                  title={
                    nodeData.showComparison
                      ? 'Show result only'
                      : 'Compare before/after'
                  }
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {nodeData.showComparison && nodeData.originalPreview ? (
              <ComparisonSlider
                beforeSrc={nodeData.originalPreview}
                afterSrc={nodeData.outputImage}
                beforeLabel="Original"
                afterLabel="Upscaled"
                position={nodeData.comparisonPosition}
                onPositionChange={handleComparisonPositionChange}
                height={128}
              />
            ) : (
              <div className="relative">
                <Image
                  src={nodeData.outputImage}
                  alt="Upscaled image"
                  width={200}
                  height={128}
                  className="h-32 w-full rounded-md object-cover"
                  unoptimized
                />
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
          </div>
        )}

        {/* Output with Comparison - Video */}
        {inputType === 'video' && nodeData.outputVideo && (
          <div className="mt-1">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Result</Label>
              {nodeData.originalPreview && nodeData.outputPreview && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleComparisonToggle}
                  title={
                    nodeData.showComparison ? 'Show video' : 'Compare frames'
                  }
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {nodeData.showComparison &&
            nodeData.originalPreview &&
            nodeData.outputPreview ? (
              <ComparisonSlider
                beforeSrc={nodeData.originalPreview}
                afterSrc={nodeData.outputPreview}
                beforeLabel="Original"
                afterLabel="Upscaled"
                position={nodeData.comparisonPosition}
                onPositionChange={handleComparisonPositionChange}
                height={128}
              />
            ) : (
              <div className="relative">
                <video
                  ref={videoRef}
                  src={nodeData.outputVideo}
                  className="h-32 w-full rounded-md object-cover cursor-pointer"
                  onClick={togglePlayback}
                  onEnded={() => setIsPlaying(false)}
                  loop
                  muted
                />
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
          </div>
        )}

        {/* Process Button */}
        {!hasOutput && (
          <Button
            variant="default"
            size="sm"
            onClick={handleProcess}
            disabled={!hasInput || nodeData.status === 'processing'}
            className="mt-1 w-full"
          >
            {nodeData.status === 'processing' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {nodeData.status === 'processing'
              ? 'Upscaling...'
              : `Upscale ${inputType === 'video' ? 'Video' : inputType === 'image' ? 'Image' : 'Media'}`}
          </Button>
        )}
      </div>
    </BaseNode>
  );
}

export const UpscaleNode = memo(UpscaleNodeComponent);
