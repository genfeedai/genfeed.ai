'use client';

import {
  ButtonSize,
  ButtonVariant,
  WorkflowNodeStatus,
} from '@genfeedai/contracts';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import {
  NodeButton,
  SelectableButton,
} from '@/features/workflows/components/ui/button';
import {
  NodeCard,
  NodeDescription,
  NodeHeader,
} from '@/features/workflows/components/ui/card';
import {
  CopyIcon,
  DownloadIcon,
  SparklesIcon,
} from '@/features/workflows/components/ui/icons';
import { NodeSelect } from '@/features/workflows/components/ui/inputs';
import {
  getStatusColor,
  HelpText,
  ProcessingMessage,
  StatusIcon,
} from '@/features/workflows/components/ui/status';
import Toggle from '@/features/workflows/components/ui/toggle/Toggle';
import { useNodeExecution } from '@/features/workflows/hooks/useNodeExecution';
import {
  getPlatformLabel,
  PLATFORM_OPTIONS,
  TONE_OPTIONS,
} from '@/features/workflows/nodes/constants';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import type {
  ExportPlatform,
  PlatformMultiplierNodeData,
} from '@/features/workflows/nodes/types';
import { PLATFORM_SPECS } from '@/features/workflows/nodes/types';

function PlatformMultiplierNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PlatformMultiplierNodeData>(
    props.data,
    platformMultiplierNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { executeNode } = useNodeExecution();

  const handlePlatformToggle = useCallback(
    (platform: ExportPlatform) => {
      const currentPlatforms = data.targetPlatforms || [];
      const newPlatforms = currentPlatforms.includes(platform)
        ? currentPlatforms.filter((p) => p !== platform)
        : [...currentPlatforms, platform];
      updateNodeData(id, { targetPlatforms: newPlatforms });
    },
    [id, data.targetPlatforms, updateNodeData],
  );

  const handleToggleCaptions = useCallback(() => {
    updateNodeData(id, { generateCaptions: !data.generateCaptions });
  }, [id, data.generateCaptions, updateNodeData]);

  const handleToneChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        captionTone: e.target
          .value as PlatformMultiplierNodeData['captionTone'],
      });
    },
    [id, updateNodeData],
  );

  const handleGenerate = useCallback(() => {
    executeNode(id);
  }, [id, executeNode]);

  const handleDownload = useCallback(
    (platform: ExportPlatform, media: string) => {
      const link = document.createElement('a');
      link.href = media;
      link.download = `${platform}_export.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [],
  );

  const handleCopyCaption = useCallback(
    async (caption: string) => {
      try {
        await navigator.clipboard.writeText(caption);
        updateNodeData(id, {
          error: undefined,
          status: WorkflowNodeStatus.IDLE,
        });
      } catch (error) {
        logger.error('Platform caption copy failed', {
          error,
          nodeId: id,
        });
        updateNodeData(id, {
          error: 'Failed to copy the platform caption.',
          status: WorkflowNodeStatus.ERROR,
        });
      }
    },
    [id, updateNodeData],
  );

  const completedCount = data.outputs.filter(
    (o) => o.status === WorkflowNodeStatus.COMPLETE,
  ).length;

  const canGenerate = data.inputMedia && data.targetPlatforms.length > 0;
  const showGenerateButton =
    data.outputs.length === 0 && data.status !== WorkflowNodeStatus.PROCESSING;
  const showHelpText =
    !data.inputMedia &&
    data.status !== WorkflowNodeStatus.PROCESSING &&
    data.outputs.length === 0;

  return (
    <NodeCard minWidth="320px">
      <NodeHeader
        icon={<CopyIcon className="size-4" />}
        title="Platform Multiplier"
        badge={
          <NodeBadge variant="purple">
            {data.targetPlatforms.length} platforms
          </NodeBadge>
        }
      />

      <NodeDescription>
        Convert one video into multiple platform-specific versions with a single
        click.
      </NodeDescription>

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Target Platforms</span>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_OPTIONS.map((platform) => (
            <SelectableButton
              key={platform.value}
              selected={data.targetPlatforms.includes(platform.value)}
              onClick={() => handlePlatformToggle(platform.value)}
              className="text-left flex-col items-start"
            >
              <div className="font-medium">{platform.label}</div>
              <div className="text-2xs text-muted-foreground">
                {PLATFORM_SPECS[platform.value].width}x
                {PLATFORM_SPECS[platform.value].height}
              </div>
            </SelectableButton>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">Generate platform captions</span>
          <Toggle
            checked={data.generateCaptions}
            onChange={handleToggleCaptions}
          />
        </div>

        {data.generateCaptions && (
          <NodeSelect
            label="Caption tone"
            value={data.captionTone || 'casual'}
            onChange={handleToneChange}
          >
            {TONE_OPTIONS.map((tone) => (
              <option key={tone.value} value={tone.value}>
                {tone.label}
              </option>
            ))}
          </NodeSelect>
        )}
      </div>

      {data.outputs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Outputs</span>
            <span className="text-muted-foreground">
              {completedCount}/{data.outputs.length} complete
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {data.outputs.map((output) => {
              const { caption, media, platform, status } = output;

              return (
                <div
                  key={platform}
                  className="p-2 border border-border bg-muted/30 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {getPlatformLabel(platform)}
                    </span>
                    <span className={getStatusColor(status)}>
                      <StatusIcon status={status} />
                    </span>
                  </div>
                  {status === WorkflowNodeStatus.COMPLETE && media && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.XS}
                        onClick={() => handleDownload(platform, media)}
                        className="flex-1"
                      >
                        <DownloadIcon className="size-4" />
                        Download
                      </Button>
                      {caption && (
                        <Button
                          variant={ButtonVariant.SECONDARY}
                          size={ButtonSize.XS}
                          onClick={() => handleCopyCaption(caption)}
                          tooltip="Copy caption"
                        >
                          Copy caption
                        </Button>
                      )}
                    </div>
                  )}
                  {status === WorkflowNodeStatus.ERROR && output.error && (
                    <p className="text-red-500 mt-1">{output.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showGenerateButton && (
        <NodeButton
          fullWidth
          onClick={handleGenerate}
          disabled={!canGenerate}
          icon={<SparklesIcon className="size-4" />}
        >
          Generate for {data.targetPlatforms.length} Platform
          {data.targetPlatforms.length !== 1 ? 's' : ''}
        </NodeButton>
      )}

      {data.status === WorkflowNodeStatus.PROCESSING && (
        <ProcessingMessage message="Generating platform versions..." />
      )}

      {showHelpText && <HelpText>Connect a video to multiply</HelpText>}

      {data.error && (
        <div className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {data.error}
        </div>
      )}
    </NodeCard>
  );
}

export const PlatformMultiplierNode = memo(PlatformMultiplierNodeComponent);

const platformMultiplierNodeDefaults: Partial<PlatformMultiplierNodeData> = {
  captionTone: 'casual',
  generateCaptions: true,
  inputMedia: null,
  inputType: null,
  jobId: null,
  label: 'Platform Multiplier',
  outputs: [],
  status: WorkflowNodeStatus.IDLE,
  targetPlatforms: ['tiktok', 'youtube_shorts', 'instagram_reels'],
};
