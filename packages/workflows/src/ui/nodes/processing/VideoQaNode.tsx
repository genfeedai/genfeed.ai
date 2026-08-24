'use client';

import type { VideoQaFailure, VideoQaNodeData } from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { type ChangeEvent, memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/execution';
import { useWorkflowStore } from '../../stores/workflow';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { BaseNode } from '../BaseNode';

function formatMetricSeconds(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${value.toFixed(1)}s`;
}

function formatFailureTimestamp(failure: VideoQaFailure): string {
  if (failure.timestamp === null) {
    return failure.message;
  }
  return `${failure.message} @ ${failure.timestamp.toFixed(2)}s`;
}

function VideoQaNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as VideoQaNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const getConnectedInputs = useWorkflowStore(
    (state) => state.getConnectedInputs,
  );
  const connectedInputs = getConnectedInputs(id);
  const connectedVideo = connectedInputs.get('video');
  const inputVideo =
    (typeof connectedVideo === 'string' ? connectedVideo : null) ??
    nodeData.inputVideo;
  const hasInputVideo = Boolean(inputVideo);
  const isProcessing = nodeData.status === NodeStatusEnum.PROCESSING;
  const report = nodeData.report;

  const handleLoudnessChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value);
      if (!Number.isFinite(nextValue)) {
        return;
      }
      updateNodeData<VideoQaNodeData>(id, {
        loudnessTargetLufs: nextValue,
      });
    },
    [id, updateNodeData],
  );

  const handleContactSheetToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<VideoQaNodeData>(id, {
          isContactSheetEnabled: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleInspect = useCallback(() => {
    if (!hasInputVideo) {
      return;
    }
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [executeNode, hasInputVideo, id, updateNodeData]);

  return (
    <BaseNode {...props}>
      <div className="space-y-3">
        {!hasInputVideo && (
          <div className="text-xs text-muted-foreground text-center">
            Connect a video to inspect
          </div>
        )}

        <div>
          <Label
            className="text-xs text-muted-foreground"
            htmlFor={`video-qa-loudness-${id}`}
          >
            Loudness target (LUFS)
          </Label>
          <Input
            className="nodrag h-8"
            id={`video-qa-loudness-${id}`}
            onChange={handleLoudnessChange}
            type="number"
            value={nodeData.loudnessTargetLufs ?? -16}
          />
        </div>

        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            checked={nodeData.isContactSheetEnabled}
            id={`video-qa-contact-sheet-${id}`}
            onCheckedChange={handleContactSheetToggle}
          />
          <Label
            className="text-sm text-foreground cursor-pointer"
            htmlFor={`video-qa-contact-sheet-${id}`}
          >
            Render contact sheet
          </Label>
        </div>

        {report && (
          <div className="space-y-2 rounded border border-border bg-background p-2">
            <div
              className={
                report.passed
                  ? 'text-sm font-medium text-chart-2'
                  : 'text-sm font-medium text-destructive'
              }
            >
              {report.passed ? 'Pass' : 'Fail'}
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Duration: {formatMetricSeconds(report.durationSeconds)}</div>
              <div>
                {report.width && report.height
                  ? `${report.width}×${report.height}`
                  : 'Resolution: —'}
                {report.frameRate !== null
                  ? ` · ${report.frameRate.toFixed(2)} fps`
                  : ''}
              </div>
              <div>
                {report.loudnessLufs !== null
                  ? `${report.loudnessLufs.toFixed(1)} LUFS`
                  : 'Loudness: n/a'}
              </div>
            </div>
            {report.failures.length > 0 && (
              <div className="space-y-1">
                {report.failures.map((failure) => (
                  <div
                    className="text-xs text-destructive"
                    key={`${failure.code}-${failure.timestamp ?? 'none'}-${failure.message}`}
                  >
                    {formatFailureTimestamp(failure)}
                  </div>
                ))}
              </div>
            )}
            {report.contactSheetUrl && (
              <Image
                alt="Video QA contact sheet"
                className="w-full rounded object-cover"
                height={120}
                src={report.contactSheetUrl}
                width={200}
              />
            )}
          </div>
        )}

        <Button
          className="w-full"
          disabled={!hasInputVideo || isProcessing}
          onClick={handleInspect}
          size="sm"
          variant="default"
        >
          {isProcessing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {isProcessing ? 'Inspecting...' : 'Inspect video'}
        </Button>
      </div>
    </BaseNode>
  );
}

export const VideoQaNode = memo(VideoQaNodeComponent);
