'use client';

import type {
  FrameSelectionMode,
  VideoFrameExtractNodeData,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Film, Loader2, RefreshCw } from 'lucide-react';
import Image from 'next/image';
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
import { BaseNode } from '../BaseNode';

const SELECTION_MODES: { value: FrameSelectionMode; label: string }[] = [
  { label: 'Last Frame', value: 'last' },
  { label: 'First Frame', value: 'first' },
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function VideoFrameExtractNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as VideoFrameExtractNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);

  const handleModeChange = useCallback(
    (value: string) => {
      updateNodeData<VideoFrameExtractNodeData>(id, {
        selectionMode: value as FrameSelectionMode,
      });
    },
    [id, updateNodeData],
  );

  const handleProcess = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  return (
    <BaseNode {...props}>
      <div className="space-y-3">
        {/* Duration Info */}
        <div className="text-xs text-[var(--muted-foreground)]">
          {nodeData.videoDuration
            ? `Source: ${formatTime(nodeData.videoDuration)}`
            : 'Connect video to extract frame'}
        </div>

        {/* Selection Mode */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)] block mb-1">
            Frame Selection
          </label>
          <Select
            value={nodeData.selectionMode}
            onValueChange={handleModeChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTION_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Output Preview */}
        {nodeData.outputImage && (
          <div className="relative">
            <Image
              src={nodeData.outputImage}
              alt="Extracted frame"
              width={200}
              height={120}
              className="w-full h-20 object-cover rounded"
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
        {!nodeData.outputImage && (
          <Button
            variant="default"
            size="sm"
            onClick={handleProcess}
            disabled={!nodeData.inputVideo || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Extracting...'
              : 'Extract Frame'}
          </Button>
        )}
      </div>
    </BaseNode>
  );
}

export const VideoFrameExtractNode = memo(VideoFrameExtractNodeComponent);
