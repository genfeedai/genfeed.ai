'use client';

import { BaseNode } from '@genfeedai/workflow-ui/nodes';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeButton } from '@workflow-cloud/components/ui/button';
import { NodeInput, NodeSelect } from '@workflow-cloud/components/ui/inputs';
import { HelpText } from '@workflow-cloud/components/ui/status';
import {
  buildWorkflowMediaNodePatch,
  clearCurrentWorkflowMedia,
  createWorkflowMediaSelectionConfig,
  createWorkflowMediaUrlConfig,
  getWorkflowMediaConfig,
  setWorkflowMediaSource,
  type WorkflowMediaSource,
} from '@workflow-cloud/nodes/input/media-picker';
import { useWorkflowMediaPicker } from '@workflow-cloud/nodes/input/useWorkflowMediaPicker';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

const IMAGE_SOURCE_OPTIONS: Array<{
  value: WorkflowMediaSource;
  label: string;
}> = [
  { label: 'Library', value: 'library' },
  { label: 'Brand References', value: 'brand-references' },
  { label: 'URL', value: 'url' },
];

function ImageIcon({
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  );
}

function CloudImageInputNodeComponent(props: NodeProps): React.JSX.Element {
  const { data, id } = props;
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const openPicker = useWorkflowMediaPicker('image');
  const mediaConfig = useMemo(
    () => getWorkflowMediaConfig(data, 'image'),
    [data],
  );
  const [urlValue, setUrlValue] = useState(mediaConfig.url ?? '');

  useEffect(() => {
    setUrlValue(mediaConfig.url ?? '');
  }, [mediaConfig.url]);

  const applyConfig = useCallback(
    (nextConfig: ReturnType<typeof getWorkflowMediaConfig>) => {
      updateNodeData(id, buildWorkflowMediaNodePatch('image', nextConfig));
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
      selectedReferenceIds:
        selectionSource === 'brand-references' && mediaConfig.itemId
          ? [mediaConfig.itemId]
          : [],
      source: selectionSource,
    });
  }, [applyConfig, mediaConfig, openPicker]);

  const handleClear = useCallback(() => {
    applyConfig(clearCurrentWorkflowMedia(mediaConfig));
  }, [applyConfig, mediaConfig]);

  const pickerLabel =
    mediaConfig.source === 'brand-references'
      ? 'Select Reference'
      : 'Select Media';

  return (
    <BaseNode
      {...props}
      title="Image Input"
      titleElement={
        <div className="flex items-center gap-2">
          <ImageIcon />
          <span>Image Input</span>
        </div>
      }
    >
      <div className="space-y-3">
        <NodeSelect
          aria-label="Image source"
          label="Source"
          value={mediaConfig.source}
          onChange={handleSourceChange}
        >
          {IMAGE_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>

        {mediaConfig.source === 'url' ? (
          <div className="space-y-2">
            <NodeInput
              aria-label="Image URL"
              label="Image URL"
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
              {pickerLabel}
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
              <img
                src={mediaConfig.resolvedUrl}
                alt={mediaConfig.label ?? 'Selected image'}
                className="h-28 w-full object-contain"
              />
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              {mediaConfig.label && <p>{mediaConfig.label}</p>}
              {mediaConfig.dimensions && (
                <p>
                  {mediaConfig.dimensions.width}x{mediaConfig.dimensions.height}
                </p>
              )}
              {mediaConfig.itemId && (
                <p className="break-all">Item ID: {mediaConfig.itemId}</p>
              )}
            </div>
          </div>
        ) : (
          <HelpText>
            {mediaConfig.source === 'brand-references'
              ? 'Pick a brand reference from the gallery.'
              : mediaConfig.source === 'url'
                ? 'Paste a direct image URL.'
                : 'Pick an image from the gallery.'}
          </HelpText>
        )}
      </div>
    </BaseNode>
  );
}

export const CloudImageInputNode = memo(CloudImageInputNodeComponent);
