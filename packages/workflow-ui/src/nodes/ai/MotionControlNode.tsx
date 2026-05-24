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

function MotionModeSelect({
  id,
  mode,
  onModeChange,
}: {
  id: string;
  mode: MotionControlMode;
  onModeChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        className="text-xs text-[var(--muted-foreground)]"
        htmlFor={`motion-mode-${id}`}
      >
        Mode
      </label>
      <Select value={mode} onValueChange={onModeChange}>
        <SelectTrigger id={`motion-mode-${id}`} className="nodrag h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MOTION_MODES.map((motionMode) => (
            <SelectItem key={motionMode.value} value={motionMode.value}>
              {motionMode.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface VideoTransferSettingsProps {
  id: string;
  nodeData: MotionControlNodeData;
  onCharacterOrientationChange: (value: string) => void;
  onKeepOriginalSoundToggle: (checked: boolean | 'indeterminate') => void;
  onQualityModeChange: (value: string) => void;
}

function VideoTransferSettings({
  id,
  nodeData,
  onCharacterOrientationChange,
  onKeepOriginalSoundToggle,
  onQualityModeChange,
}: VideoTransferSettingsProps) {
  return (
    <>
      <div>
        <label
          className="text-xs text-[var(--muted-foreground)]"
          htmlFor={`motion-quality-${id}`}
        >
          Quality
        </label>
        <Select
          value={nodeData.qualityMode}
          onValueChange={onQualityModeChange}
        >
          <SelectTrigger
            id={`motion-quality-${id}`}
            className="nodrag h-8 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUALITY_MODES.map((qualityMode) => (
              <SelectItem key={qualityMode.value} value={qualityMode.value}>
                {qualityMode.label} - {qualityMode.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          className="text-xs text-[var(--muted-foreground)]"
          htmlFor={`motion-character-orientation-${id}`}
        >
          Character Orientation
        </label>
        <Select
          value={nodeData.characterOrientation}
          onValueChange={onCharacterOrientationChange}
        >
          <SelectTrigger
            id={`motion-character-orientation-${id}`}
            className="nodrag h-8 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHARACTER_ORIENTATIONS.map((orientation) => (
              <SelectItem key={orientation.value} value={orientation.value}>
                {orientation.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 nodrag">
        <Checkbox
          id={`keep-sound-${id}`}
          checked={nodeData.keepOriginalSound}
          onCheckedChange={onKeepOriginalSoundToggle}
        />
        <label
          htmlFor={`keep-sound-${id}`}
          className="text-sm text-[var(--foreground)] cursor-pointer"
        >
          Keep Original Sound
        </label>
      </div>
    </>
  );
}

interface StandardMotionSettingsProps {
  id: string;
  nodeData: MotionControlNodeData;
  onAspectRatioChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onMotionStrengthChange: (value: number[]) => void;
}

function StandardMotionSettings({
  id,
  nodeData,
  onAspectRatioChange,
  onDurationChange,
  onMotionStrengthChange,
}: StandardMotionSettingsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            className="text-xs text-[var(--muted-foreground)]"
            htmlFor={`motion-duration-${id}`}
          >
            Duration
          </label>
          <Select
            value={String(nodeData.duration)}
            onValueChange={onDurationChange}
          >
            <SelectTrigger
              id={`motion-duration-${id}`}
              className="nodrag h-8 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((duration) => (
                <SelectItem key={duration.value} value={String(duration.value)}>
                  {duration.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label
            className="text-xs text-[var(--muted-foreground)]"
            htmlFor={`motion-aspect-ratio-${id}`}
          >
            Aspect Ratio
          </label>
          <Select
            value={nodeData.aspectRatio}
            onValueChange={onAspectRatioChange}
          >
            <SelectTrigger
              id={`motion-aspect-ratio-${id}`}
              className="nodrag h-8 w-full"
            >
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

      <div>
        <label className="text-xs text-[var(--muted-foreground)]">
          Motion Strength: {nodeData.motionStrength}%
        </label>
        <Slider
          value={[nodeData.motionStrength]}
          min={0}
          max={100}
          step={5}
          onValueChange={onMotionStrengthChange}
          className="nodrag w-full"
        />
        <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>Subtle</span>
          <span>Strong</span>
        </div>
      </div>
    </>
  );
}

function MotionOutputPreview({
  outputVideo,
  isProcessing,
  onGenerate,
}: {
  isProcessing: boolean;
  onGenerate: () => void;
  outputVideo?: string | null;
}) {
  if (!outputVideo) return null;

  return (
    <div className="relative">
      <video
        src={outputVideo}
        className="w-full h-20 object-cover rounded cursor-pointer"
        controls
      >
        <track kind="captions" />
      </video>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onGenerate}
        disabled={isProcessing}
        className="absolute top-1 right-1 size-6 bg-black/50 hover:bg-black/70"
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}

function MotionRequirementHint({
  canGenerate,
  isProcessing,
  isVideoTransferMode,
}: {
  canGenerate: boolean;
  isProcessing: boolean;
  isVideoTransferMode: boolean;
}) {
  return (
    <>
      {!canGenerate && !isProcessing && (
        <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
          <AlertCircle className="size-3" />
          {isVideoTransferMode
            ? 'Connect an image and motion video'
            : 'Connect an image to generate'}
        </div>
      )}

      {isVideoTransferMode && (
        <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
          <Video className="size-3" />
          Motion video: 3-30 seconds
        </div>
      )}
    </>
  );
}

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
            <Expand className="size-3" />
          </Button>
        )}
        {nodeData.status === 'processing' ? (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            <Square className="size-4 fill-current" />
            Generating
          </Button>
        ) : (
          <Button
            variant={canGenerate ? 'default' : 'secondary'}
            size="sm"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            <Play className="size-4 fill-current" />
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
        <MotionModeSelect
          id={id}
          mode={nodeData.mode}
          onModeChange={handleModeChange}
        />
        {isVideoTransferMode && (
          <VideoTransferSettings
            id={id}
            nodeData={nodeData}
            onCharacterOrientationChange={handleCharacterOrientationChange}
            onKeepOriginalSoundToggle={handleKeepOriginalSoundToggle}
            onQualityModeChange={handleQualityModeChange}
          />
        )}

        {!isVideoTransferMode && (
          <StandardMotionSettings
            id={id}
            nodeData={nodeData}
            onAspectRatioChange={handleAspectRatioChange}
            onDurationChange={handleDurationChange}
            onMotionStrengthChange={handleMotionStrengthChange}
          />
        )}

        <MotionOutputPreview
          outputVideo={nodeData.outputVideo}
          isProcessing={nodeData.status === 'processing'}
          onGenerate={handleGenerate}
        />
        <MotionRequirementHint
          canGenerate={canGenerate}
          isProcessing={nodeData.status === 'processing'}
          isVideoTransferMode={isVideoTransferMode}
        />
      </div>
    </BaseNode>
  );
}

export const MotionControlNode = memo(MotionControlNodeComponent);
