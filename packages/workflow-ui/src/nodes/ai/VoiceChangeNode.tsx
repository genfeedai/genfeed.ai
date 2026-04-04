'use client';

import type { VoiceChangeNodeData } from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { AudioLines, Expand, Loader2, RefreshCw, Video } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useExecutionStore } from '../../stores/executionStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

function VoiceChangeNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as VoiceChangeNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'voiceChange',
  });

  const handlePreserveOriginalChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<VoiceChangeNodeData>(id, {
          preserveOriginalAudio: checked,
        });
      }
    },
    [id, updateNodeData],
  );

  const handleMixLevelChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<VoiceChangeNodeData>(id, { audioMixLevel: value });
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

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Preserve Original Audio Toggle */}
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`preserve-${id}`}
            checked={nodeData.preserveOriginalAudio}
            onCheckedChange={handlePreserveOriginalChange}
          />
          <label
            htmlFor={`preserve-${id}`}
            className="text-xs text-[var(--muted-foreground)] cursor-pointer"
          >
            Mix with original audio
          </label>
        </div>

        {/* Audio Mix Level (only when preserving original) */}
        {nodeData.preserveOriginalAudio && (
          <div>
            <label className="text-xs text-[var(--muted-foreground)]">
              Mix Level: {Math.round(nodeData.audioMixLevel * 100)}%
            </label>
            <Slider
              value={[nodeData.audioMixLevel]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={handleMixLevelChange}
              className="nodrag w-full"
            />
            <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>Original</span>
              <span>New</span>
            </div>
          </div>
        )}

        {/* Output Video Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              controls
              className="w-full rounded border border-[var(--border)]"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleProcess}
              disabled={nodeData.status === 'processing' || !canGenerate}
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Process Button */}
        {!nodeData.outputVideo && (
          <Button
            variant={canGenerate ? 'default' : 'secondary'}
            size="sm"
            onClick={handleProcess}
            disabled={!canGenerate || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Video className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Processing...'
              : nodeData.preserveOriginalAudio
                ? 'Mix Audio'
                : 'Replace Audio'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AudioLines className="w-3 h-3" />
            Connect video + new audio
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const VoiceChangeNode = memo(VoiceChangeNodeComponent);
