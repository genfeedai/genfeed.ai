'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

import type {
  VideoQaFailure,
  VideoQaNodeData,
} from '@genfeedai/contracts/types';
import { NodeStatusEnum } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { Checkbox } from '@genfeedai/ui/primitives/checkbox';
import { Input } from '@genfeedai/ui/primitives/input';
import { Label } from '@genfeedai/ui/primitives/label';
import type { NodeProps } from '@xyflow/react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/execution';
import { useWorkflowStore } from '../../stores/workflow';
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
  const translate = useTranslations('pages.workflows.videoQa');
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
            {translate('connectVideo')}
          </div>
        )}

        <div>
          <Label
            className="text-xs text-muted-foreground"
            htmlFor={`video-qa-loudness-${id}`}
          >
            {translate('loudnessTarget')}
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
            {translate('contactSheet')}
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
              {report.passed ? translate('pass') : translate('fail')}
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                {translate('duration', {
                  value: formatMetricSeconds(report.durationSeconds),
                })}
              </div>
              <div>
                {report.width && report.height
                  ? `${report.width}×${report.height}`
                  : translate('resolutionFallback')}
                {report.frameRate !== null
                  ? ` · ${report.frameRate.toFixed(2)} fps`
                  : ''}
              </div>
              <div>
                {report.loudnessLufs !== null
                  ? translate('loudness', {
                      value: report.loudnessLufs.toFixed(1),
                    })
                  : translate('loudnessNa')}
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
                alt={translate('contactSheetAlt')}
                className="w-full rounded object-cover"
                height={120}
                src={report.contactSheetUrl}
                width={200}
              />
            )}
          </div>
        )}

        <Button
          withWrapper={false}
          className="w-full"
          disabled={!hasInputVideo || isProcessing}
          onClick={handleInspect}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        >
          {isProcessing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {isProcessing ? translate('inspecting') : translate('inspect')}
        </Button>
      </div>
    </BaseNode>
  );
}

export const VideoQaNode = memo(VideoQaNodeComponent);
