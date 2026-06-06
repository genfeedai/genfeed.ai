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

const VIDEO_PRICE_ESTIMATES: Record<string, number> = {
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

function getVideoPriceEstimate(
  resolution: TopazVideoResolution,
  fps: TopazVideoFPS,
) {
  const key = `${resolution}-${fps}`;
  const perFiveSeconds = VIDEO_PRICE_ESTIMATES[key] ?? 0.101;
  return `~$${perFiveSeconds.toFixed(3)}/5s`;
}

function InputModeNotice({
  inputType,
}: {
  inputType: 'image' | 'video' | null;
}) {
  if (!inputType) {
    return (
      <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 text-center">
        Connect an image or video input
      </div>
    );
  }

  return (
    <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
      Mode: <span className="font-medium capitalize">{inputType}</span>
    </div>
  );
}

function ModelSelect({
  models,
  value,
  onValueChange,
}: {
  models: { value: UpscaleModel; label: string }[];
  onValueChange: (value: string) => void;
  value: UpscaleModel;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Model</Label>
      <Select value={value} onValueChange={onValueChange}>
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
  );
}

interface ImageUpscaleSettingsProps {
  id: string;
  nodeData: UpscaleNodeData;
  onCreativityChange: (value: number[]) => void;
  onFaceEnhancementToggle: (checked: boolean | 'indeterminate') => void;
  onFactorChange: (value: string) => void;
  onFormatChange: (value: string) => void;
  onStrengthChange: (value: number[]) => void;
}

function ImageUpscaleSettings({
  id,
  nodeData,
  onCreativityChange,
  onFaceEnhancementToggle,
  onFactorChange,
  onFormatChange,
  onStrengthChange,
}: ImageUpscaleSettingsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Upscale Factor</Label>
        <Select value={nodeData.upscaleFactor} onValueChange={onFactorChange}>
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

      <div className="space-y-1.5">
        <Label className="text-xs">Output Format</Label>
        <Select value={nodeData.outputFormat} onValueChange={onFormatChange}>
          <SelectTrigger className="nodrag h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="jpg">JPG</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`${id}-face-enhance`}
            checked={nodeData.faceEnhancement}
            onCheckedChange={onFaceEnhancementToggle}
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
            <FaceEnhancementSlider
              label="Strength"
              value={nodeData.faceEnhancementStrength}
              onValueChange={onStrengthChange}
            />
            <FaceEnhancementSlider
              label="Creativity"
              value={nodeData.faceEnhancementCreativity}
              onValueChange={onCreativityChange}
            />
          </div>
        )}
      </div>
    </>
  );
}

function FaceEnhancementSlider({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: number[]) => void;
  value: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <Label className="text-[10px]">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{value}%</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        onValueChange={onValueChange}
        className="nodrag w-full"
      />
    </div>
  );
}

interface VideoUpscaleSettingsProps {
  nodeData: UpscaleNodeData;
  onFpsChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
}

function VideoUpscaleSettings({
  nodeData,
  onFpsChange,
  onResolutionChange,
}: VideoUpscaleSettingsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Target Resolution</Label>
        <Select
          value={nodeData.targetResolution}
          onValueChange={onResolutionChange}
        >
          <SelectTrigger className="nodrag h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTIONS.map((resolution) => (
              <SelectItem key={resolution.value} value={resolution.value}>
                {resolution.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Target Frame Rate</Label>
        <Select value={String(nodeData.targetFps)} onValueChange={onFpsChange}>
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

      <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
        Estimated cost:{' '}
        {getVideoPriceEstimate(nodeData.targetResolution, nodeData.targetFps)}
      </div>
    </>
  );
}

interface UpscaleImageOutputProps {
  nodeData: UpscaleNodeData;
  onComparisonPositionChange: (position: number) => void;
  onComparisonToggle: () => void;
  onProcess: () => void;
}

function UpscaleImageOutput({
  nodeData,
  onComparisonPositionChange,
  onComparisonToggle,
  onProcess,
}: UpscaleImageOutputProps) {
  if (!nodeData.outputImage) return null;

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">Result</Label>
        {nodeData.originalPreview && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onComparisonToggle}
            title={
              nodeData.showComparison
                ? 'Show result only'
                : 'Compare before/after'
            }
          >
            <SplitSquareHorizontal className="size-3.5" />
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
          onPositionChange={onComparisonPositionChange}
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
          <RefreshOutputButton onProcess={onProcess} status={nodeData.status} />
        </div>
      )}
    </div>
  );
}

interface UpscaleVideoOutputProps {
  nodeData: UpscaleNodeData;
  onComparisonPositionChange: (position: number) => void;
  onComparisonToggle: () => void;
  onProcess: () => void;
}

function UpscaleVideoOutput({
  nodeData,
  onComparisonPositionChange,
  onComparisonToggle,
  onProcess,
}: UpscaleVideoOutputProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  if (!nodeData.outputVideo) return null;

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">Result</Label>
        {nodeData.originalPreview && nodeData.outputPreview && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onComparisonToggle}
            title={nodeData.showComparison ? 'Show video' : 'Compare frames'}
          >
            <SplitSquareHorizontal className="size-3.5" />
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
          onPositionChange={onComparisonPositionChange}
          height={128}
        />
      ) : (
        <div className="relative">
          <video
            ref={videoRef}
            src={nodeData.outputVideo}
            aria-label="Upscaled video output"
            className="h-32 w-full rounded-md object-cover cursor-pointer"
            onClick={togglePlayback}
            onEnded={() => setIsPlaying(false)}
            loop
            muted
          />
          <RefreshOutputButton onProcess={onProcess} status={nodeData.status} />
        </div>
      )}
    </div>
  );
}

function RefreshOutputButton({
  onProcess,
  status,
}: {
  onProcess: () => void;
  status: UpscaleNodeData['status'];
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onProcess}
      disabled={status === 'processing'}
      className="absolute right-2 top-2 size-6 bg-black/50 hover:bg-black/70"
    >
      <RefreshCw className="size-3.5 text-white" />
    </Button>
  );
}

function UpscaleProcessButton({
  hasInput,
  inputType,
  onProcess,
  status,
}: {
  hasInput: boolean;
  inputType: 'image' | 'video' | null;
  onProcess: () => void;
  status: UpscaleNodeData['status'];
}) {
  const label =
    status === 'processing'
      ? 'Upscaling...'
      : `Upscale ${inputType === 'video' ? 'Video' : inputType === 'image' ? 'Image' : 'Media'}`;

  return (
    <Button
      variant="default"
      size="sm"
      onClick={onProcess}
      disabled={!hasInput || status === 'processing'}
      className="mt-1 w-full"
    >
      {status === 'processing' && <Loader2 className="size-4 animate-spin" />}
      {label}
    </Button>
  );
}

function UpscaleNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as UpscaleNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);

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
          <Expand className="size-3" />
        </Button>
      ) : null,
    [hasOutput, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="flex flex-col gap-3">
        <InputModeNotice inputType={inputType} />
        <ModelSelect
          models={models}
          value={nodeData.model}
          onValueChange={handleModelChange}
        />
        {inputType === 'image' && (
          <ImageUpscaleSettings
            id={id}
            nodeData={nodeData}
            onCreativityChange={handleCreativityChange}
            onFaceEnhancementToggle={handleFaceEnhancementToggle}
            onFactorChange={handleFactorChange}
            onFormatChange={handleFormatChange}
            onStrengthChange={handleStrengthChange}
          />
        )}
        {inputType === 'video' && (
          <VideoUpscaleSettings
            nodeData={nodeData}
            onFpsChange={handleFpsChange}
            onResolutionChange={handleResolutionChange}
          />
        )}
        {inputType === 'image' && nodeData.outputImage && (
          <UpscaleImageOutput
            nodeData={nodeData}
            onComparisonPositionChange={handleComparisonPositionChange}
            onComparisonToggle={handleComparisonToggle}
            onProcess={handleProcess}
          />
        )}
        {inputType === 'video' && nodeData.outputVideo && (
          <UpscaleVideoOutput
            nodeData={nodeData}
            onComparisonPositionChange={handleComparisonPositionChange}
            onComparisonToggle={handleComparisonToggle}
            onProcess={handleProcess}
          />
        )}
        {!hasOutput && (
          <UpscaleProcessButton
            hasInput={hasInput}
            inputType={inputType}
            onProcess={handleProcess}
            status={nodeData.status}
          />
        )}
      </div>
    </BaseNode>
  );
}

export const UpscaleNode = memo(UpscaleNodeComponent);
