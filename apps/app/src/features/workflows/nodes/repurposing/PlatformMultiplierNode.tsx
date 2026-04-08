'use client';

import {
  ButtonSize,
  ButtonVariant,
  WorkflowNodeStatus,
} from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
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
} from '@/features/workflows/components/ui/icons/node-icons';
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
    (_platform: ExportPlatform, media: string) => {
      const link = document.createElement('a');
      link.href = media;
      link.download = `${_platform}_export.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [],
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
        icon={<CopyIcon />}
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

      {/* Platform Selection */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          Target Platforms
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_OPTIONS.map((platform) => (
            <SelectableButton
              key={platform.value}
              selected={data.targetPlatforms.includes(platform.value)}
              onClick={() => handlePlatformToggle(platform.value)}
              className="text-left flex-col items-start"
            >
              <div className="font-medium">{platform.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {PLATFORM_SPECS[platform.value].width}x
                {PLATFORM_SPECS[platform.value].height}
              </div>
            </SelectableButton>
          ))}
        </div>
      </div>

      {/* Caption Generation Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm">Generate platform captions</label>
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

      {/* Output Results */}
      {data.outputs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Outputs</span>
            <span className="text-muted-foreground">
              {completedCount}/{data.outputs.length} complete
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {data.outputs.map((output) => (
              <div
                key={output.platform}
                className="p-2 border border-white/[0.08] bg-muted/30 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {getPlatformLabel(output.platform)}
                  </span>
                  <span className={getStatusColor(output.status)}>
                    <StatusIcon status={output.status} />
                  </span>
                </div>
                {output.status === WorkflowNodeStatus.COMPLETE &&
                  output.media && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.XS}
                        onClick={() =>
                          handleDownload(output.platform, output.media!)
                        }
                        className="flex-1"
                      >
                        <DownloadIcon />
                        Download
                      </Button>
                      {output.caption && (
                        <Button
                          variant={ButtonVariant.SECONDARY}
                          size={ButtonSize.XS}
                          onClick={() =>
                            navigator.clipboard.writeText(output.caption!)
                          }
                          tooltip="Copy caption"
                        >
                          Copy caption
                        </Button>
                      )}
                    </div>
                  )}
                {output.status === WorkflowNodeStatus.ERROR && output.error && (
                  <p className="text-red-500 mt-1">{output.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showGenerateButton && (
        <NodeButton
          fullWidth
          onClick={handleGenerate}
          disabled={!canGenerate}
          icon={<SparklesIcon />}
        >
          Generate for {data.targetPlatforms.length} Platform
          {data.targetPlatforms.length !== 1 ? 's' : ''}
        </NodeButton>
      )}

      {data.status === WorkflowNodeStatus.PROCESSING && (
        <ProcessingMessage message="Generating platform versions..." />
      )}

      {showHelpText && <HelpText>Connect a video to multiply</HelpText>}
    </NodeCard>
  );
}

export const PlatformMultiplierNode = memo(PlatformMultiplierNodeComponent);

export const platformMultiplierNodeDefaults: Partial<PlatformMultiplierNodeData> =
  {
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
