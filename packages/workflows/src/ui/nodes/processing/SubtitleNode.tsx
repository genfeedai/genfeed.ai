'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  SubtitleNodeData,
  SubtitlePosition,
  SubtitleStyle,
} from '@genfeedai/contracts/types';
import { NodeStatusEnum } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { Input } from '@genfeedai/ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genfeedai/ui/primitives/select';
import { Slider } from '@genfeedai/ui/primitives/slider';
import type { NodeProps } from '@xyflow/react';
import { Captions, LoaderCircle, RefreshCw } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/execution';
import { useWorkflowStore } from '../../stores/workflow';
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
        <div className="text-xs text-muted-foreground">
          {hasRequiredInputs
            ? 'Ready to burn subtitles'
            : 'Connect video and subtitle text'}
        </div>

        {/* Style Selection */}
        <div>
          <label
            className="text-xs text-muted-foreground block mb-1"
            htmlFor={`subtitle-style-${id}`}
          >
            Style
          </label>
          <Select value={nodeData.style} onValueChange={handleStyleChange}>
            <SelectTrigger
              id={`subtitle-style-${id}`}
              className="nodrag h-8 w-full"
            >
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
          <label
            className="text-xs text-muted-foreground block mb-1"
            htmlFor={`subtitle-position-${id}`}
          >
            Position
          </label>
          <Select
            value={nodeData.position}
            onValueChange={handlePositionChange}
          >
            <SelectTrigger
              id={`subtitle-position-${id}`}
              className="nodrag h-8 w-full"
            >
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
          <div
            className="text-xs text-muted-foreground block mb-1"
            id={`subtitle-font-size-${id}`}
          >
            Font Size: {nodeData.fontSize}px
          </div>
          <Slider
            aria-labelledby={`subtitle-font-size-${id}`}
            value={[nodeData.fontSize]}
            min={12}
            max={72}
            onValueChange={handleFontSizeChange}
            className="nodrag w-full"
          />
        </div>

        {/* Font Color */}
        <div className="flex items-center gap-2">
          <label
            className="text-xs text-muted-foreground"
            htmlFor={`subtitle-color-${id}`}
          >
            Color
          </label>
          <Input
            aria-label="Subtitle color"
            id={`subtitle-color-${id}`}
            type="color"
            value={nodeData.fontColor}
            onChange={handleFontColorChange}
            className="size-8 rounded border border-border cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">
            {nodeData.fontColor}
          </span>
        </div>

        {/* Output Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              aria-label="Subtitled video output"
              className="w-full h-20 object-cover rounded"
              muted
            />
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={handleProcess}
              disabled={nodeData.status === 'processing'}
              className={
                'absolute top-1 right-1 size-6 bg-black/50 hover:bg-black/70' /* design-system-allow-content-color */
              }
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        )}

        {/* Process Button */}
        {!nodeData.outputVideo && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleProcess}
            disabled={!hasRequiredInputs || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Captions className="size-4" />
            )}
            {nodeData.status === 'processing' ? 'Burning...' : 'Burn Captions'}
          </Button>
        )}
      </div>
    </BaseNode>
  );
}

export const SubtitleNode = memo(SubtitleNodeComponent);
