'use client';

import type {
  CharacterOrientation,
  KlingQualityMode,
  MotionControlMode,
  MotionControlNodeData,
} from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Expand,
  Play,
  RefreshCw,
  Square,
  Video,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

const QUALITY_MODES: {
  value: KlingQualityMode;
  label: string;
  description: string;
}[] = [
  { description: 'Faster processing', label: 'Standard', value: 'std' },
  { description: 'Higher quality', label: 'Pro', value: 'pro' },
];

const CHARACTER_ORIENTATIONS: { value: CharacterOrientation; label: string }[] =
  [
    { label: 'From Image', value: 'image' },
    { label: 'From Video', value: 'video' },
  ];

const MOTION_MODES: {
  value: MotionControlMode;
  label: string;
  description: string;
}[] = [
  {
    description: 'Apply motion from reference video',
    label: 'Video Transfer',
    value: 'video_transfer',
  },
  { description: 'Apply camera movements', label: 'Camera', value: 'camera' },
  {
    description: 'Define motion path',
    label: 'Trajectory',
    value: 'trajectory',
  },
  { description: 'Camera + Trajectory', label: 'Combined', value: 'combined' },
];

const ASPECT_RATIOS: { value: '16:9' | '9:16' | '1:1'; label: string }[] = [
  { label: '16:9 (Landscape)', value: '16:9' },
  { label: '9:16 (Portrait)', value: '9:16' },
  { label: '1:1 (Square)', value: '1:1' },
];

const DURATIONS: { value: 5 | 10; label: string }[] = [
  { label: '5 seconds', value: 5 },
  { label: '10 seconds', value: 10 },
];

function MotionControlNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as MotionControlNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { handleGenerate, handleStop } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'motionControl',
  });

  const handleModeChange = useCallback(
    (value: string) => {
      updateNodeData<MotionControlNodeData>(id, {
        mode: value as MotionControlMode,
      });
    },
    [id, updateNodeData],
  );

  const handleQualityModeChange = useCallback(
    (value: string) => {
      updateNodeData<MotionControlNodeData>(id, {
        qualityMode: value as KlingQualityMode,
      });
    },
    [id, updateNodeData],
  );

  const handleCharacterOrientationChange = useCallback(
    (value: string) => {
      updateNodeData<MotionControlNodeData>(id, {
        characterOrientation: value as CharacterOrientation,
      });
    },
    [id, updateNodeData],
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNodeData<MotionControlNodeData>(id, {
        aspectRatio: value as '16:9' | '9:16' | '1:1',
      });
    },
    [id, updateNodeData],
  );

  const handleDurationChange = useCallback(
    (value: string) => {
      updateNodeData<MotionControlNodeData>(id, {
        duration: Number.parseInt(value, 10) as 5 | 10,
      });
    },
    [id, updateNodeData],
  );

  const handleKeepOriginalSoundToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<MotionControlNodeData>(id, {
          keepOriginalSound: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleMotionStrengthChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<MotionControlNodeData>(id, { motionStrength: value });
    },
    [id, updateNodeData],
  );

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const isVideoTransferMode = nodeData.mode === 'video_transfer';

  const headerActions = useMemo(
    () => (
      <>
        {nodeData.outputVideo && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleExpand}
            title="Expand preview"
          >
            <Expand className="h-3 w-3" />
          </Button>
        )}
        {nodeData.status === 'processing' ? (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            <Square className="h-4 w-4 fill-current" />
            Generating
          </Button>
        ) : (
          <Button
            variant={canGenerate ? 'default' : 'secondary'}
            size="sm"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            <Play className="h-4 w-4 fill-current" />
            Generate
          </Button>
        )}
      </>
    ),
    [
      nodeData.outputVideo,
      nodeData.status,
      handleGenerate,
      handleStop,
      handleExpand,
      canGenerate,
    ],
  );

  return (
    <BaseNode {...props} headerActions={headerActions} hideStatusIndicator>
      <div className="space-y-3">
        {/* Mode Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Mode</label>
          <Select value={nodeData.mode} onValueChange={handleModeChange}>
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOTION_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Video Transfer specific options */}
        {isVideoTransferMode && (
          <>
            {/* Quality Mode */}
            <div>
              <label className="text-xs text-[var(--muted-foreground)]">
                Quality
              </label>
              <Select
                value={nodeData.qualityMode}
                onValueChange={handleQualityModeChange}
              >
                <SelectTrigger className="nodrag h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label} - {mode.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Character Orientation */}
            <div>
              <label className="text-xs text-[var(--muted-foreground)]">
                Character Orientation
              </label>
              <Select
                value={nodeData.characterOrientation}
                onValueChange={handleCharacterOrientationChange}
              >
                <SelectTrigger className="nodrag h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARACTER_ORIENTATIONS.map((orientation) => (
                    <SelectItem
                      key={orientation.value}
                      value={orientation.value}
                    >
                      {orientation.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Keep Original Sound */}
            <div className="flex items-center gap-2 nodrag">
              <Checkbox
                id={`keep-sound-${id}`}
                checked={nodeData.keepOriginalSound}
                onCheckedChange={handleKeepOriginalSoundToggle}
              />
              <label
                htmlFor={`keep-sound-${id}`}
                className="text-sm text-[var(--foreground)] cursor-pointer"
              >
                Keep Original Sound
              </label>
            </div>
          </>
        )}

        {!isVideoTransferMode && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {/* Duration */}
              <div>
                <label className="text-xs text-[var(--muted-foreground)]">
                  Duration
                </label>
                <Select
                  value={String(nodeData.duration)}
                  onValueChange={handleDurationChange}
                >
                  <SelectTrigger className="nodrag h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="text-xs text-[var(--muted-foreground)]">
                  Aspect Ratio
                </label>
                <Select
                  value={nodeData.aspectRatio}
                  onValueChange={handleAspectRatioChange}
                >
                  <SelectTrigger className="nodrag h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((ratio) => (
                      <SelectItem key={ratio.value} value={ratio.value}>
                        {ratio.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Motion Strength Slider */}
            <div>
              <label className="text-xs text-[var(--muted-foreground)]">
                Motion Strength: {nodeData.motionStrength}%
              </label>
              <Slider
                value={[nodeData.motionStrength]}
                min={0}
                max={100}
                step={5}
                onValueChange={handleMotionStrengthChange}
                className="nodrag w-full"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                <span>Subtle</span>
                <span>Strong</span>
              </div>
            </div>
          </>
        )}

        {/* Output Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              className="w-full h-20 object-cover rounded cursor-pointer"
              controls
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleGenerate}
              disabled={nodeData.status === 'processing'}
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {isVideoTransferMode
              ? 'Connect an image and motion video'
              : 'Connect an image to generate'}
          </div>
        )}

        {/* Info about video requirements */}
        {isVideoTransferMode && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <Video className="w-3 h-3" />
            Motion video: 3-30 seconds
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const MotionControlNode = memo(MotionControlNodeComponent);
