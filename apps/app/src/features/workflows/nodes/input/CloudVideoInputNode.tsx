'use client';

import { BaseNode } from '@genfeedai/workflow-ui/nodes';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { NodeButton } from '@/features/workflows/components/ui/button';
import {
  NodeInput,
  NodeSelect,
} from '@/features/workflows/components/ui/inputs';
import { HelpText } from '@/features/workflows/components/ui/status';
import {
  buildWorkflowMediaNodePatch,
  clearCurrentWorkflowMedia,
  createWorkflowMediaSelectionConfig,
  createWorkflowMediaUrlConfig,
  getWorkflowMediaConfig,
  setWorkflowMediaSource,
  type WorkflowMediaSource,
} from '@/features/workflows/nodes/input/media-picker';
import { useWorkflowMediaPicker } from '@/features/workflows/nodes/input/useWorkflowMediaPicker';

const VIDEO_SOURCE_OPTIONS: Array<{
  value: WorkflowMediaSource;
  label: string;
}> = [
  { label: 'Library', value: 'library' },
  { label: 'Brand Videos', value: 'brand-references' },
  { label: 'URL', value: 'url' },
];

function VideoIcon({
  className = 'h-4 w-4',
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CloudVideoInputNodeComponent(props: NodeProps): React.JSX.Element {
  const { data, id } = props;
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const openPicker = useWorkflowMediaPicker('video');
  const mediaConfig = useMemo(
    () => getWorkflowMediaConfig(data, 'video'),
    [data],
  );
  const [urlValue, setUrlValue] = useState(mediaConfig.url ?? '');

  useEffect(() => {
    setUrlValue(mediaConfig.url ?? '');
  }, [mediaConfig.url]);

  const applyConfig = useCallback(
    (nextConfig: ReturnType<typeof getWorkflowMediaConfig>) => {
      updateNodeData(id, buildWorkflowMediaNodePatch('video', nextConfig));
    },
    [id, updateNodeData],
  );

  const handleSourceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      applyConfig(
        setWorkflowMediaSource(
          mediaConfig,
          event.target.value as WorkflowMediaSource,
        ),
      );
    },
    [applyConfig, mediaConfig],
  );

  const handleLoadUrl = useCallback(() => {
    const trimmedUrl = urlValue.trim();
    if (trimmedUrl.length === 0) {
      return;
    }

    applyConfig(createWorkflowMediaUrlConfig(mediaConfig, trimmedUrl));
  }, [applyConfig, mediaConfig, urlValue]);

  const handleSelectMedia = useCallback(() => {
    if (mediaConfig.source === 'url') {
      return;
    }

    const selectionSource = mediaConfig.source;

    openPicker({
      onPick: (selection) => {
        if (!selection) {
          return;
        }

        applyConfig(
          createWorkflowMediaSelectionConfig(
            mediaConfig,
            selectionSource,
            selection,
          ),
        );
      },
      selectedItemId: mediaConfig.itemId,
      source: selectionSource,
    });
  }, [applyConfig, mediaConfig, openPicker]);

  const handleClear = useCallback(() => {
    applyConfig(clearCurrentWorkflowMedia(mediaConfig));
  }, [applyConfig, mediaConfig]);

  return (
    <BaseNode
      {...props}
      title="Video Input"
      titleElement={
        <div className="flex items-center gap-2">
          <VideoIcon />
          <span>Video Input</span>
        </div>
      }
    >
      <div className="space-y-3">
        <NodeSelect
          aria-label="Video source"
          label="Source"
          value={mediaConfig.source}
          onChange={handleSourceChange}
        >
          {VIDEO_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>

        {mediaConfig.source === 'url' ? (
          <div className="space-y-2">
            <NodeInput
              aria-label="Video URL"
              label="Video URL"
              placeholder="https://..."
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
            />
            <div className="flex gap-2">
              <NodeButton
                fullWidth
                onClick={handleLoadUrl}
                disabled={urlValue.trim().length === 0}
              >
                Load URL
              </NodeButton>
              {mediaConfig.resolvedUrl && (
                <NodeButton variant="ghost" onClick={handleClear}>
                  Clear
                </NodeButton>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <NodeButton fullWidth onClick={handleSelectMedia}>
              Select Media
            </NodeButton>
            {mediaConfig.resolvedUrl && (
              <NodeButton variant="ghost" onClick={handleClear}>
                Clear
              </NodeButton>
            )}
          </div>
        )}

        {mediaConfig.resolvedUrl ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded bg-black/20">
              <video
                src={mediaConfig.resolvedUrl}
                className="h-28 w-full object-contain"
                controls
                muted
                playsInline
              />
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              {mediaConfig.label && <p>{mediaConfig.label}</p>}
              {mediaConfig.dimensions && (
                <p>
                  {mediaConfig.dimensions.width}x{mediaConfig.dimensions.height}
                </p>
              )}
              {mediaConfig.duration !== null && (
                <p>Duration: {Math.round(mediaConfig.duration)}s</p>
              )}
              {mediaConfig.itemId && (
                <p className="break-all">Item ID: {mediaConfig.itemId}</p>
              )}
            </div>
          </div>
        ) : (
          <HelpText>
            {mediaConfig.source === 'url'
              ? 'Paste a direct video URL.'
              : mediaConfig.source === 'brand-references'
                ? 'Pick a brand-scoped video from the gallery.'
                : 'Pick a video from the gallery.'}
          </HelpText>
        )}
      </div>
    </BaseNode>
  );
}

export const CloudVideoInputNode = memo(CloudVideoInputNodeComponent);
