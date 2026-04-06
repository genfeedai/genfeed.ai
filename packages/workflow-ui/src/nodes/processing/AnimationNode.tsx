'use client';

import type { AnimationNodeData, EasingPreset } from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { AlertCircle, Expand, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useRequiredInputs } from '../../hooks/useRequiredInputs';
import { CubicBezierEditor } from '../../lib/CubicBezierEditor';
import { EASING_PRESETS } from '../../lib/easing';
import { useExecutionStore } from '../../stores/executionStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

const PRESET_OPTIONS: { value: EasingPreset; label: string }[] = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease In', value: 'easeIn' },
  { label: 'Ease Out', value: 'easeOut' },
  { label: 'Ease In Out', value: 'easeInOut' },
  { label: 'Ease In Quad', value: 'easeInQuad' },
  { label: 'Ease Out Quad', value: 'easeOutQuad' },
  { label: 'Ease In Out Quad', value: 'easeInOutQuad' },
  { label: 'Ease In Cubic', value: 'easeInCubic' },
  { label: 'Ease Out Cubic', value: 'easeOutCubic' },
  { label: 'Ease In Out Cubic', value: 'easeInOutCubic' },
  { label: 'Ease In Expo', value: 'easeInExpo' },
  { label: 'Ease Out Expo', value: 'easeOutExpo' },
  { label: 'Ease In Out Expo', value: 'easeInOutExpo' },
];

function AnimationNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as AnimationNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { hasRequiredInputs } = useRequiredInputs(id, type as 'animation');

  const handleCurveTypeChange = useCallback(
    (type: 'preset' | 'custom') => {
      updateNodeData<AnimationNodeData>(id, { curveType: type });
    },
    [id, updateNodeData],
  );

  const handlePresetChange = useCallback(
    (value: string) => {
      const preset = value as EasingPreset;
      updateNodeData<AnimationNodeData>(id, {
        customCurve: EASING_PRESETS[preset],
        preset,
      });
    },
    [id, updateNodeData],
  );

  const handleSpeedChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<AnimationNodeData>(id, {
        speedMultiplier: value,
      });
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

  const headerActions = useMemo(
    () =>
      nodeData.outputVideo ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="h-3 w-3" />
        </Button>
      ) : null,
    [nodeData.outputVideo, handleExpand],
  );

  // SVG curve preview - fallback to easeInOutCubic if customCurve is undefined
  const curve = nodeData.customCurve ?? [0.645, 0.045, 0.355, 1];
  const pathD = `M 0 100 C ${curve[0] * 100} ${100 - curve[1] * 100}, ${curve[2] * 100} ${100 - curve[3] * 100}, 100 0`;

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Curve Type Toggle */}
        <div className="flex gap-1 p-1 bg-[var(--background)] rounded">
          <Button
            variant={nodeData.curveType === 'preset' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleCurveTypeChange('preset')}
            className={`flex-1 text-xs h-auto py-1 px-2 ${
              nodeData.curveType === 'preset'
                ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90'
                : 'text-[var(--muted-foreground)] hover:bg-[var(--border)]'
            }`}
          >
            Preset
          </Button>
          <Button
            variant={nodeData.curveType === 'custom' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleCurveTypeChange('custom')}
            className={`flex-1 text-xs h-auto py-1 px-2 ${
              nodeData.curveType === 'custom'
                ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90'
                : 'text-[var(--muted-foreground)] hover:bg-[var(--border)]'
            }`}
          >
            Custom
          </Button>
        </div>

        {/* Preset Selector */}
        {nodeData.curveType === 'preset' && (
          <div>
            <label className="text-xs text-[var(--muted-foreground)]">
              Easing Preset
            </label>
            <Select value={nodeData.preset} onValueChange={handlePresetChange}>
              <SelectTrigger className="nodrag h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom Bezier Editor */}
        {nodeData.curveType === 'custom' && (
          <CubicBezierEditor
            value={curve}
            onChange={(v) =>
              updateNodeData<AnimationNodeData>(id, { customCurve: v })
            }
            disabled={nodeData.status === 'processing'}
          />
        )}

        {/* Curve Preview (preset only) */}
        {nodeData.curveType === 'preset' && (
          <div className="h-20 bg-[var(--background)] rounded border border-[var(--border)] p-2">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <path
                d={pathD}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
              />
              <circle cx="0" cy="100" r="3" fill="var(--foreground)" />
              <circle cx="100" cy="0" r="3" fill="var(--foreground)" />
              <circle
                cx={curve[0] * 100}
                cy={100 - curve[1] * 100}
                r="2"
                fill="var(--accent)"
              />
              <circle
                cx={curve[2] * 100}
                cy={100 - curve[3] * 100}
                r="2"
                fill="var(--accent)"
              />
            </svg>
          </div>
        )}

        {/* Speed Multiplier */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Speed: {nodeData.speedMultiplier.toFixed(1)}x
          </label>
          <Slider
            value={[nodeData.speedMultiplier]}
            min={0.25}
            max={4}
            step={0.25}
            onValueChange={handleSpeedChange}
            className="nodrag w-full"
          />
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>0.25x</span>
            <span>4x</span>
          </div>
        </div>

        {/* Output Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              className="w-full h-20 object-cover rounded"
              controls
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleProcess}
              disabled={nodeData.status === 'processing'}
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Process Button */}
        {!nodeData.outputVideo && (
          <Button
            variant="default"
            size="sm"
            onClick={handleProcess}
            disabled={!hasRequiredInputs || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Applying...'
              : 'Apply Animation'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!hasRequiredInputs && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connect a video to animate
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const AnimationNode = memo(AnimationNodeComponent);
