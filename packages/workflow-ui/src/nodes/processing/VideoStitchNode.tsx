'use client';

import type {
  AudioCodec,
  TransitionType,
  VideoStitchNodeData,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Layers, Loader2, RefreshCw, Zap } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
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

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { label: 'Cut (No transition)', value: 'cut' },
  { label: 'Crossfade', value: 'crossfade' },
  { label: 'Fade to Black', value: 'fade' },
  { label: 'Wipe', value: 'wipe' },
];

const AUDIO_CODECS: { value: AudioCodec; label: string; hint: string }[] = [
  { hint: 'Best compatibility', label: 'AAC', value: 'aac' },
  { hint: 'Legacy fallback', label: 'MP3', value: 'mp3' },
];

function VideoStitchNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as VideoStitchNodeData;
  const inputVideos = nodeData.inputVideos ?? [];
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);

  const handleTransitionChange = useCallback(
    (value: string) => {
      updateNodeData<VideoStitchNodeData>(id, {
        transitionType: value as TransitionType,
      });
    },
    [id, updateNodeData],
  );

  const handleDurationChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<VideoStitchNodeData>(id, {
        transitionDuration: value,
      });
    },
    [id, updateNodeData],
  );

  const handleLoopToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<VideoStitchNodeData>(id, {
          seamlessLoop: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleAudioCodecChange = useCallback(
    (value: string) => {
      updateNodeData<VideoStitchNodeData>(id, {
        audioCodec: value as AudioCodec,
      });
    },
    [id, updateNodeData],
  );

  const handleQualityToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<VideoStitchNodeData>(id, {
          outputQuality: checked ? 'draft' : 'full',
        });
      }
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
        {/* Input Videos Info */}
        <div className="p-2 bg-[var(--background)] rounded border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)]">
            Input Videos: {inputVideos.length}
          </div>
          {inputVideos.length > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {inputVideos.map((_, index) => (
                <div
                  key={index}
                  className="w-6 h-6 bg-[var(--primary)]/20 rounded text-xs flex items-center justify-center text-[var(--primary)]"
                >
                  {index + 1}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transition Type */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Transition
          </label>
          <Select
            value={nodeData.transitionType}
            onValueChange={handleTransitionChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transition Duration */}
        {nodeData.transitionType !== 'cut' && (
          <div>
            <label className="text-xs text-[var(--muted-foreground)]">
              Duration: {nodeData.transitionDuration.toFixed(1)}s
            </label>
            <Slider
              value={[nodeData.transitionDuration]}
              min={0.1}
              max={2}
              step={0.1}
              onValueChange={handleDurationChange}
              className="nodrag w-full"
            />
          </div>
        )}

        {/* Seamless Loop Toggle */}
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`seamless-loop-${id}`}
            checked={nodeData.seamlessLoop}
            onCheckedChange={handleLoopToggle}
          />
          <label
            htmlFor={`seamless-loop-${id}`}
            className="text-sm text-[var(--foreground)] cursor-pointer"
          >
            Seamless Loop
          </label>
        </div>

        {/* Audio Codec */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Audio Codec
          </label>
          <Select
            value={nodeData.audioCodec}
            onValueChange={handleAudioCodecChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_CODECS.map((codec) => (
                <SelectItem key={codec.value} value={codec.value}>
                  {codec.label} - {codec.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Draft Quality Toggle */}
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`draft-quality-${id}`}
            checked={nodeData.outputQuality === 'draft'}
            onCheckedChange={handleQualityToggle}
          />
          <label
            htmlFor={`draft-quality-${id}`}
            className="text-sm text-[var(--foreground)] cursor-pointer flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            Draft Quality
          </label>
          {nodeData.outputQuality === 'draft' && (
            <span className="text-xs text-[var(--muted-foreground)]">
              (720p, faster)
            </span>
          )}
        </div>

        {/* Output Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              className="w-full h-20 object-cover rounded"
              controls
              loop={nodeData.seamlessLoop}
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
            disabled={
              inputVideos.length < 2 || nodeData.status === 'processing'
            }
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Layers className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Stitching...'
              : 'Stitch Videos'}
          </Button>
        )}

        {inputVideos.length < 2 && !nodeData.outputVideo && (
          <div className="text-xs text-[var(--muted-foreground)] text-center">
            Connect at least 2 videos to stitch
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const VideoStitchNode = memo(VideoStitchNodeComponent);
