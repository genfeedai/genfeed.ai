'use client';

import type { VideoTrimNodeData } from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Expand,
  Loader2,
  RefreshCw,
  Scissors,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTime(timeStr: string): number {
  const [mins, secs] = timeStr.split(':').map(Number);
  return (mins || 0) * 60 + (secs || 0);
}

function VideoTrimNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as VideoTrimNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);

  const hasRequiredInputs = !!nodeData.inputVideo;

  const handleStartTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseTime(e.target.value);
      updateNodeData<VideoTrimNodeData>(id, { startTime: value });
    },
    [id, updateNodeData],
  );

  const handleEndTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseTime(e.target.value);
      updateNodeData<VideoTrimNodeData>(id, { endTime: value });
    },
    [id, updateNodeData],
  );

  const handleStartSliderChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<VideoTrimNodeData>(id, { startTime: value });
    },
    [id, updateNodeData],
  );

  const handleEndSliderChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<VideoTrimNodeData>(id, { endTime: value });
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

  const trimDuration = nodeData.endTime - nodeData.startTime;
  const maxDuration = nodeData.duration || 3600;

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Duration Info */}
        <div className="text-xs text-[var(--muted-foreground)]">
          {nodeData.duration
            ? `Source: ${formatTime(nodeData.duration)}`
            : 'Connect video to get duration'}
        </div>

        {/* Start Time */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Start: {formatTime(nodeData.startTime)}
          </label>
          <Slider
            value={[nodeData.startTime]}
            min={0}
            max={maxDuration}
            step={1}
            onValueChange={handleStartSliderChange}
            className="nodrag w-full"
          />
          <input
            type="text"
            value={formatTime(nodeData.startTime)}
            onChange={handleStartTimeChange}
            placeholder="0:00"
            className="w-full mt-1 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        {/* End Time */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            End: {formatTime(nodeData.endTime)}
          </label>
          <Slider
            value={[nodeData.endTime]}
            min={0}
            max={maxDuration}
            step={1}
            onValueChange={handleEndSliderChange}
            className="nodrag w-full"
          />
          <input
            type="text"
            value={formatTime(nodeData.endTime)}
            onChange={handleEndTimeChange}
            placeholder="1:00"
            className="w-full mt-1 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        {/* Trim Duration Display */}
        <div className="p-2 bg-[var(--background)] border border-[var(--border)] rounded text-center">
          <span className="text-sm font-medium">
            Clip Length: {formatTime(trimDuration)}
          </span>
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
              <Scissors className="w-4 h-4" />
            )}
            {nodeData.status === 'processing' ? 'Trimming...' : 'Trim Video'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!hasRequiredInputs && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connect a video to trim
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const VideoTrimNode = memo(VideoTrimNodeComponent);
