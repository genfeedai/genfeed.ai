'use client';

import type {
  SubtitleNodeData,
  SubtitlePosition,
  SubtitleStyle,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Loader2, RefreshCw, Subtitles } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
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

const STYLE_OPTIONS: { value: SubtitleStyle; label: string }[] = [
  { label: 'Modern', value: 'modern' },
  { label: 'Default', value: 'default' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Bold', value: 'bold' },
];

const POSITION_OPTIONS: { value: SubtitlePosition; label: string }[] = [
  { label: 'Bottom', value: 'bottom' },
  { label: 'Center', value: 'center' },
  { label: 'Top', value: 'top' },
];

function SubtitleNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as SubtitleNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);

  const handleStyleChange = useCallback(
    (value: string) => {
      updateNodeData<SubtitleNodeData>(id, { style: value as SubtitleStyle });
    },
    [id, updateNodeData],
  );

  const handlePositionChange = useCallback(
    (value: string) => {
      updateNodeData<SubtitleNodeData>(id, {
        position: value as SubtitlePosition,
      });
    },
    [id, updateNodeData],
  );

  const handleFontSizeChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<SubtitleNodeData>(id, { fontSize: value });
    },
    [id, updateNodeData],
  );

  const handleFontColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<SubtitleNodeData>(id, { fontColor: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleProcess = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  const hasRequiredInputs = nodeData.inputVideo && nodeData.inputText;

  return (
    <BaseNode {...props}>
      <div className="space-y-3">
        {/* Input Status */}
        <div className="text-xs text-[var(--muted-foreground)]">
          {hasRequiredInputs
            ? 'Ready to burn subtitles'
            : 'Connect video and subtitle text'}
        </div>

        {/* Style Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)] block mb-1">
            Style
          </label>
          <Select value={nodeData.style} onValueChange={handleStyleChange}>
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Position Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)] block mb-1">
            Position
          </label>
          <Select
            value={nodeData.position}
            onValueChange={handlePositionChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)] block mb-1">
            Font Size: {nodeData.fontSize}px
          </label>
          <Slider
            value={[nodeData.fontSize]}
            min={12}
            max={72}
            onValueChange={handleFontSizeChange}
            className="nodrag w-full"
          />
        </div>

        {/* Font Color */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--muted-foreground)]">
            Color
          </label>
          <input
            type="color"
            value={nodeData.fontColor}
            onChange={handleFontColorChange}
            className="w-8 h-8 rounded border border-[var(--border)] cursor-pointer"
          />
          <span className="text-xs text-[var(--muted-foreground)]">
            {nodeData.fontColor}
          </span>
        </div>

        {/* Output Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              className="w-full h-20 object-cover rounded"
              muted
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
              <Subtitles className="w-4 h-4" />
            )}
            {nodeData.status === 'processing' ? 'Burning...' : 'Burn Subtitles'}
          </Button>
        )}
      </div>
    </BaseNode>
  );
}

export const SubtitleNode = memo(SubtitleNodeComponent);
