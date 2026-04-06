'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeButton } from '@/features/workflows/components/ui/button';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import {
  CheckCircleIcon,
  DownloadIcon,
  PlatformIcon,
} from '@/features/workflows/components/ui/icons/node-icons';
import {
  NodeInput,
  NodeSelect,
} from '@/features/workflows/components/ui/inputs';
import { MediaPreview } from '@/features/workflows/components/ui/media';
import {
  HelpText,
  ProcessingMessage,
} from '@/features/workflows/components/ui/status';
import {
  getPlatformIconType,
  getPlatformLabel,
  PLATFORM_OPTIONS,
} from '@/features/workflows/nodes/constants';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import {
  type ExportPlatform,
  PLATFORM_SPECS,
  type PlatformExportNodeData,
} from '@/features/workflows/nodes/types';

function PlatformExportNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PlatformExportNodeData>(
    props.data,
    platformExportNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const selectedSpec = PLATFORM_SPECS[data.platform];

  const handlePlatformChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { platform: e.target.value as ExportPlatform });
    },
    [id, updateNodeData],
  );

  const handleCustomWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, {
        customWidth: parseInt(e.target.value, 10) || undefined,
      });
    },
    [id, updateNodeData],
  );

  const handleCustomHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, {
        customHeight: parseInt(e.target.value, 10) || undefined,
      });
    },
    [id, updateNodeData],
  );

  const handleExport = useCallback(() => {
    if (!data.outputMedia) {
      return;
    }

    const link = document.createElement('a');
    link.href = data.outputMedia;
    const extension = data.inputType === 'video' ? 'mp4' : 'png';
    link.download = `${data.platform}_export.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data.outputMedia, data.inputType, data.platform]);

  return (
    <NodeCard>
      <NodeHeader
        title="Platform Export"
        badge={
          <span className="text-xs text-muted-foreground">
            {selectedSpec.width}x{selectedSpec.height}
          </span>
        }
      />

      <NodeSelect
        label="Target Platform"
        value={data.platform}
        onChange={handlePlatformChange}
      >
        <optgroup label="Vertical (9:16)">
          {PLATFORM_OPTIONS.filter((p) => p.aspectRatio === '9:16').map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </optgroup>
        <optgroup label="Square (1:1)">
          {PLATFORM_OPTIONS.filter((p) => p.aspectRatio === '1:1').map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </optgroup>
        <optgroup label="Horizontal (16:9)">
          {PLATFORM_OPTIONS.filter(
            (p) => p.aspectRatio === '16:9' || p.aspectRatio === 'Custom',
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </NodeSelect>

      {/* Platform Specs Display */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <PlatformIcon type={getPlatformIconType(data.platform)} />
          <span>{selectedSpec.aspectRatio}</span>
        </div>
        {selectedSpec.maxDuration && (
          <div className="text-muted-foreground">
            Max: {selectedSpec.maxDuration}s
          </div>
        )}
        {selectedSpec.maxFileSize && (
          <div className="text-muted-foreground">
            Size: {selectedSpec.maxFileSize}MB
          </div>
        )}
        <div className="text-muted-foreground">
          {selectedSpec.codec.toUpperCase()} /{' '}
          {selectedSpec.audioCodec.toUpperCase()}
        </div>
      </div>

      {/* Custom Dimensions */}
      {data.platform === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <NodeInput
            label="Width"
            type="number"
            value={data.customWidth || 1920}
            onChange={handleCustomWidthChange}
            min={320}
            max={4096}
          />
          <NodeInput
            label="Height"
            type="number"
            value={data.customHeight || 1080}
            onChange={handleCustomHeightChange}
            min={320}
            max={4096}
          />
        </div>
      )}

      {/* Preview */}
      {data.inputMedia && (
        <MediaPreview src={data.inputMedia} type={data.inputType} />
      )}

      {/* Output / Download */}
      {data.outputMedia ? (
        <>
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircleIcon />
            <span className="text-sm">Export Ready</span>
          </div>
          <NodeButton fullWidth onClick={handleExport} icon={<DownloadIcon />}>
            Download for {getPlatformLabel(data.platform)}
          </NodeButton>
        </>
      ) : data.status === WorkflowNodeStatus.PROCESSING ? (
        <ProcessingMessage
          message={`Encoding for ${getPlatformLabel(data.platform)}...`}
        />
      ) : (
        <HelpText>Connect media to export</HelpText>
      )}
    </NodeCard>
  );
}

export const PlatformExportNode = memo(PlatformExportNodeComponent);

export const platformExportNodeDefaults: Partial<PlatformExportNodeData> = {
  exportedSpec: null,
  inputMedia: null,
  inputType: null,
  jobId: null,
  label: 'Platform Export',
  outputMedia: null,
  platform: 'tiktok',
  status: WorkflowNodeStatus.IDLE,
};
