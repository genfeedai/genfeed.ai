'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

import type {
  LipSyncMode,
  LipSyncModel,
  LipSyncNodeData,
} from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { Checkbox } from '@genfeedai/ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genfeedai/ui/primitives/select';
import { Slider } from '@genfeedai/ui/primitives/slider';
import type { NodeProps } from '@xyflow/react';
import { Expand, LoaderCircle, Mic, RefreshCw, Video } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { LIPSYNC_MODELS, LIPSYNC_SYNC_MODES } from '../../lib/models/registry';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflow';
import { BaseNode } from '../BaseNode';

function LipSyncNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as LipSyncNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { handleGenerate } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'lipSync',
  });

  const handleModelChange = useCallback(
    (value: string) => {
      updateNodeData<LipSyncNodeData>(id, { model: value as LipSyncModel });
    },
    [id, updateNodeData],
  );

  const handleSyncModeChange = useCallback(
    (value: string) => {
      updateNodeData<LipSyncNodeData>(id, { syncMode: value as LipSyncMode });
    },
    [id, updateNodeData],
  );

  const handleTemperatureChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<LipSyncNodeData>(id, { temperature: value });
    },
    [id, updateNodeData],
  );

  const handleActiveSpeakerChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<LipSyncNodeData>(id, { activeSpeaker: checked });
      }
    },
    [id, updateNodeData],
  );

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const currentModel = LIPSYNC_MODELS.find((m) => m.value === nodeData.model);
  const isSyncModel = nodeData.model.startsWith('sync/');
  const supportsImage = currentModel?.supportsImage ?? false;

  const headerActions = useMemo(
    () =>
      nodeData.outputVideo ? (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="size-3" />
        </Button>
      ) : null,
    [nodeData.outputVideo, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Model Selection */}
        <div>
          <label
            htmlFor={`lipsync-model-${id}`}
            className="text-xs text-muted-foreground"
          >
            Model
          </label>
          <Select value={nodeData.model} onValueChange={handleModelChange}>
            <SelectTrigger
              id={`lipsync-model-${id}`}
              className="nodrag h-8 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIPSYNC_MODELS.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sync Mode (only for Sync Labs models) */}
        {isSyncModel && (
          <div>
            <label
              htmlFor={`lipsync-sync-mode-${id}`}
              className="text-xs text-muted-foreground"
            >
              Sync Mode
            </label>
            <Select
              value={nodeData.syncMode}
              onValueChange={handleSyncModeChange}
            >
              <SelectTrigger
                id={`lipsync-sync-mode-${id}`}
                className="nodrag h-8 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIPSYNC_SYNC_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Temperature Slider */}
        <div>
          <div
            id={`lipsync-temperature-${id}`}
            className="text-xs text-muted-foreground"
          >
            Temperature: {nodeData.temperature.toFixed(2)}
          </div>
          <Slider
            aria-labelledby={`lipsync-temperature-${id}`}
            value={[nodeData.temperature]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleTemperatureChange}
            className="nodrag w-full"
          />
        </div>

        {/* Active Speaker Toggle (only for Sync Labs models) */}
        {isSyncModel && (
          <div className="flex items-center gap-2 nodrag">
            <Checkbox
              id={`active-speaker-${id}`}
              checked={nodeData.activeSpeaker}
              onCheckedChange={handleActiveSpeakerChange}
            />
            <label
              htmlFor={`active-speaker-${id}`}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Active speaker detection
            </label>
          </div>
        )}

        {/* Output Video Preview */}
        {nodeData.outputVideo && (
          <div className="relative">
            <video
              src={nodeData.outputVideo}
              aria-label="Lip-synced video output"
              controls
              className="w-full rounded border border-border"
            />
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={handleGenerate}
              disabled={nodeData.status === 'processing' || !canGenerate}
              className={
                'absolute top-1 right-1 size-6 bg-black/50 hover:bg-black/70' /* design-system-allow-content-color */
              }
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        )}

        {/* Generate Button */}
        {!nodeData.outputVideo && (
          <Button
            withWrapper={false}
            variant={
              canGenerate ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            size={ButtonSize.SM}
            onClick={handleGenerate}
            disabled={!canGenerate || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Video className="size-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Generating...'
              : 'Generate Lip Sync'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Mic className="size-3" />
            {supportsImage
              ? 'Connect audio + image to generate'
              : 'Connect audio + video to generate'}
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const LipSyncNode = memo(LipSyncNodeComponent);
