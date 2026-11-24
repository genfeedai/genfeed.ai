'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { BaseNode } from '@genfeedai/workflows/ui/nodes';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { OptionSelect } from '@ui/primitives/option-select';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback, useMemo } from 'react';
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
import { UrlInputSection } from '@/features/workflows/nodes/input/UrlInputSection';
import { useWorkflowMediaPicker } from '@/features/workflows/nodes/input/useWorkflowMediaPicker';
import { useWorkflowMediaPreviewUrl } from '@/features/workflows/nodes/input/useWorkflowMediaPreviewUrl';
import { VideoIcon } from '@/features/workflows/nodes/input/VideoIcon';

const VIDEO_SOURCE_OPTIONS: Array<{
  value: WorkflowMediaSource;
  label: string;
}> = [
  { label: 'Library', value: 'library' },
  { label: 'Brand Videos', value: 'brand-references' },
  { label: 'URL', value: 'url' },
];

function CloudVideoInputNodeComponent(props: NodeProps): React.JSX.Element {
  const { data, id } = props;
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const openPicker = useWorkflowMediaPicker('video');
  const mediaConfig = useMemo(
    () => getWorkflowMediaConfig(data, 'video'),
    [data],
  );

  const previewUrl = useWorkflowMediaPreviewUrl('video', mediaConfig);

  const applyConfig = useCallback(
    (nextConfig: ReturnType<typeof getWorkflowMediaConfig>) => {
      updateNodeData(id, buildWorkflowMediaNodePatch('video', nextConfig));
    },
    [id, updateNodeData],
  );

  const handleSourceChange = useCallback(
    (source: string) => {
      applyConfig(
        setWorkflowMediaSource(mediaConfig, source as WorkflowMediaSource),
      );
    },
    [applyConfig, mediaConfig],
  );

  const handleLoadUrl = useCallback(
    (trimmedUrl: string) => {
      applyConfig(createWorkflowMediaUrlConfig(mediaConfig, trimmedUrl));
    },
    [applyConfig, mediaConfig],
  );

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
      title="Video"
      titleElement={
        <div className="flex items-center gap-2">
          <VideoIcon />
          <span>Video</span>
        </div>
      }
    >
      <div className="space-y-3">
        <FormControl label="Source">
          <OptionSelect
            ariaLabel="Video source"
            onValueChange={handleSourceChange}
            options={VIDEO_SOURCE_OPTIONS}
            value={mediaConfig.source}
          />
        </FormControl>

        {mediaConfig.source === 'url' ? (
          <UrlInputSection
            key={mediaConfig.url ?? ''}
            mediaConfig={mediaConfig}
            onLoadUrl={handleLoadUrl}
            onClear={handleClear}
          />
        ) : (
          <div className="flex gap-2">
            <Button
              className="w-full"
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
              onClick={handleSelectMedia}
            >
              Select Media
            </Button>
            {mediaConfig.resolvedUrl && (
              <Button
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {previewUrl ? (
          <div className="space-y-2">
            <div
              className={
                'overflow-hidden rounded bg-black/20' // design-system-allow-content-color
              }
            >
              <VideoPlayer
                ariaLabel="Cloud video preview"
                src={previewUrl}
                className="h-28 w-full"
                config={{
                  preload: 'metadata',
                  controls: true,
                  autoPlay: false,
                  loop: false,
                  muted: true,
                  playsInline: true,
                }}
              />
            </div>
            <div className="space-y-1 text-2xs text-muted-foreground">
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
