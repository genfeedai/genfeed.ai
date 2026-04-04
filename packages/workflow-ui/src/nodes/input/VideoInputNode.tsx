'use client';

import type { VideoInputNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Expand, Link, Loader2, Upload, Video, X } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useMediaUpload } from '../../hooks/useMediaUpload';
import { getVideoMetadata } from '../../lib/media';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function VideoInputNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as VideoInputNodeData;
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);

  const {
    fileInputRef,
    showUrlInput,
    setShowUrlInput,
    urlValue,
    setUrlValue,
    isUploading,
    handleFileSelect,
    handleRemove,
    handleUrlSubmit,
    handleUrlKeyDown,
  } = useMediaUpload<VideoInputNodeData>({
    buildRemoveUpdate: () => ({
      dimensions: null,
      duration: null,
      filename: null,
      url: undefined,
      video: null,
    }),
    buildUploadUpdate: (url, filename, metadata) => {
      const meta = metadata as {
        duration: number;
        dimensions: { width: number; height: number };
      };
      return {
        dimensions: meta.dimensions,
        duration: meta.duration,
        filename,
        source: 'upload' as const,
        video: url,
      };
    },
    buildUrlUpdate: (url, metadata) => {
      if (metadata) {
        const meta = metadata as {
          duration: number;
          width: number;
          height: number;
        };
        return {
          dimensions: { height: meta.height, width: meta.width },
          duration: meta.duration,
          filename: url.split('/').pop() || 'url-video',
          source: 'url' as const,
          url,
          video: url,
        };
      }
      return {
        dimensions: null,
        duration: null,
        filename: url.split('/').pop() || 'url-video',
        source: 'url' as const,
        url,
        video: url,
      };
    },
    getMetadata: async (src) => {
      const meta = await getVideoMetadata(src);
      return meta;
    },
    initialUrl: nodeData.url || '',
    mediaType: 'video',
    nodeId: id,
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  // Header actions - Upload, Link, and Expand buttons
  const headerActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {nodeData.video && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleExpand}
            title="Expand preview"
          >
            <Expand className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          title="Upload video"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowUrlInput(!showUrlInput)}
          title="Paste URL"
        >
          <Link className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
    [nodeData.video, handleExpand, fileInputRef, showUrlInput, setShowUrlInput],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* URL Input (shown when link button clicked) */}
      {showUrlInput && (
        <div className="mb-3 flex gap-2">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://..."
            className="nodrag nopan flex-1 h-7 px-2 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUrlSubmit}
            disabled={!urlValue.trim()}
            className="h-7 px-2 text-xs"
          >
            Load
          </Button>
        </div>
      )}

      {/* Video Preview or Empty State */}
      {nodeData.video ? (
        <div className="relative max-h-32 overflow-hidden rounded-md bg-black/20">
          <video
            src={nodeData.video}
            className="w-full h-auto max-h-32 object-contain cursor-pointer"
            muted
          />
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={handleRemove}
            className="absolute right-1.5 top-1.5 h-5 w-5"
          >
            <X className="h-3 w-3" />
          </Button>
          <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px]">
            {nodeData.dimensions &&
              `${nodeData.dimensions.width}x${nodeData.dimensions.height}`}
            {nodeData.duration && ` • ${formatDuration(nodeData.duration)}`}
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex flex-1 min-h-16 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/50 bg-secondary/20 transition-colors hover:border-primary/50 hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-5 w-5 text-muted-foreground/50 animate-spin" />
              <span className="text-[10px] text-muted-foreground/70">
                Uploading...
              </span>
            </>
          ) : (
            <>
              <Video className="h-5 w-5 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/70">
                Drop or click
              </span>
            </>
          )}
        </button>
      )}
    </BaseNode>
  );
}

export const VideoInputNode = memo(VideoInputNodeComponent);
