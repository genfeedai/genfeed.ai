'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import { CheckCircleIcon } from '@/features/workflows/components/ui/icons/node-icons';
import {
  NodeInput,
  NodeSelect,
} from '@/features/workflows/components/ui/inputs';
import { MediaPreview } from '@/features/workflows/components/ui/media';
import {
  HelpText,
  ProcessingMessage,
} from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import type {
  ColorGradeMode,
  ColorGradeNodeData,
  ColorGradePreset,
} from '@/features/workflows/nodes/types';

const PRESET_OPTIONS: Array<{ value: ColorGradePreset; label: string }> = [
  { label: 'Instagram Warm', value: 'instagram-warm' },
  { label: 'Instagram Cool', value: 'instagram-cool' },
  { label: 'Instagram Moody', value: 'instagram-moody' },
  { label: 'Instagram Bright', value: 'instagram-bright' },
  { label: 'Custom', value: 'custom' },
];

const MODE_OPTIONS: Array<{ value: ColorGradeMode; label: string }> = [
  { label: 'Preset', value: 'preset' },
  { label: 'Custom Sliders', value: 'custom' },
  { label: 'AI Style Match', value: 'ai-style' },
];

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function SliderField({
  label,
  value,
  onChange,
}: SliderFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

function EffectColorGradeNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<ColorGradeNodeData>(
    props.data,
    colorGradeNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { mode: e.target.value as ColorGradeMode });
    },
    [id, updateNodeData],
  );

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { preset: e.target.value as ColorGradePreset });
    },
    [id, updateNodeData],
  );

  const handleSliderChange = useCallback(
    (
      field: keyof Pick<
        ColorGradeNodeData,
        | 'warmth'
        | 'contrast'
        | 'saturation'
        | 'vignette'
        | 'grain'
        | 'sharpness'
      >,
    ) =>
      (value: number) => {
        updateNodeData(id, { [field]: value });
      },
    [id, updateNodeData],
  );

  const handleStyleRefChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { styleReferenceImage: e.target.value || null });
    },
    [id, updateNodeData],
  );

  const showSliders = data.mode === 'custom';
  const showPresets = data.mode === 'preset';
  const showStyleRef = data.mode === 'ai-style';

  return (
    <NodeCard>
      <NodeHeader
        title="Color Grade"
        badge={
          <span className="text-xs text-muted-foreground">
            {data.mode === 'ai-style' ? 'AI' : data.preset}
          </span>
        }
      />

      {/* Mode Selection */}
      <NodeSelect label="Mode" value={data.mode} onChange={handleModeChange}>
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NodeSelect>

      {/* Preset Selection */}
      {showPresets && (
        <NodeSelect
          label="Preset"
          value={data.preset}
          onChange={handlePresetChange}
        >
          {PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>
      )}

      {/* Custom Sliders */}
      {showSliders && (
        <div className="space-y-2">
          <SliderField
            label="Warmth"
            value={data.warmth}
            onChange={handleSliderChange('warmth')}
          />
          <SliderField
            label="Contrast"
            value={data.contrast}
            onChange={handleSliderChange('contrast')}
          />
          <SliderField
            label="Saturation"
            value={data.saturation}
            onChange={handleSliderChange('saturation')}
          />
          <SliderField
            label="Vignette"
            value={data.vignette}
            onChange={handleSliderChange('vignette')}
          />
          <SliderField
            label="Sharpness"
            value={data.sharpness}
            onChange={handleSliderChange('sharpness')}
          />
          <SliderField
            label="Grain"
            value={data.grain}
            onChange={handleSliderChange('grain')}
          />
        </div>
      )}

      {/* AI Style Reference */}
      {showStyleRef && (
        <NodeInput
          label="Style Reference Image URL"
          type="text"
          value={data.styleReferenceImage || ''}
          onChange={handleStyleRefChange}
          placeholder="https://..."
        />
      )}

      {/* Input Preview */}
      {data.inputImage && <MediaPreview src={data.inputImage} type="image" />}

      {/* Output / Status */}
      {data.outputImage ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircleIcon />
            <span className="text-sm">Color grading applied</span>
          </div>
          <MediaPreview src={data.outputImage} type="image" />
        </div>
      ) : data.status === WorkflowNodeStatus.PROCESSING ? (
        <ProcessingMessage message="Applying color grade..." />
      ) : (
        <HelpText>Connect an image to apply color grading</HelpText>
      )}
    </NodeCard>
  );
}

export const EffectColorGradeNode = memo(EffectColorGradeNodeComponent);

export const colorGradeNodeDefaults: Partial<ColorGradeNodeData> = {
  contrast: 55,
  grain: 15,
  inputImage: null,
  jobId: null,
  label: 'Color Grade',
  mode: 'preset',
  outputImage: null,
  preset: 'instagram-warm',
  saturation: 45,
  sharpness: 40,
  status: WorkflowNodeStatus.IDLE,
  styleReferenceImage: null,
  vignette: 30,
  warmth: 60,
};
