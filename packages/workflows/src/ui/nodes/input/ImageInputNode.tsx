'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ImageInputNodeData } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { Input } from '@genfeedai/ui/primitives/input';
import type { NodeProps } from '@xyflow/react';
import { Expand, ImageIcon, Link, LoaderCircle, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo } from 'react';
import { useMediaUpload } from '../../hooks/useMediaUpload';
import { getImageDimensions } from '../../lib/media';
import { useUIStore } from '../../stores/uiStore';
import { BaseNode } from '../BaseNode';

function ImageInputNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as ImageInputNodeData;
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
  } = useMediaUpload<ImageInputNodeData>({
    buildRemoveUpdate: () => ({
      dimensions: null,
      filename: null,
      image: null,
      url: undefined,
    }),
    buildUploadUpdate: (url, filename, metadata) => ({
      dimensions: metadata as { width: number; height: number },
      filename,
      image: url,
      source: 'upload' as const,
    }),
    buildUrlUpdate: (url, metadata) => ({
      dimensions: metadata as { width: number; height: number } | null,
      filename: url.split('/').pop() || 'url-image',
      image: url,
      source: 'url' as const,
      url,
    }),
    getMetadata: async (src) => {
      const dims = await getImageDimensions(src);
      return dims;
    },
    initialUrl: nodeData.url || '',
    mediaType: 'image',
    nodeId: id,
  });

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  // Header actions - Upload, Link, and Expand buttons
  const headerActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {nodeData.image && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={handleExpand}
            title="Expand preview"
          >
            <Expand className="size-3.5" />
          </Button>
        )}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => fileInputRef.current?.click()}
          title="Upload image"
        >
          <Upload className="size-3.5" />
        </Button>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => setShowUrlInput(!showUrlInput)}
          title="Paste URL"
        >
          <Link className="size-3.5" />
        </Button>
      </div>
    ),
    [nodeData.image, handleExpand, fileInputRef, showUrlInput, setShowUrlInput],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      {/* Hidden file input */}
      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload image file"
      />

      {/* URL Input (shown when link button clicked) */}
      {showUrlInput && (
        <div className="mb-3 flex gap-2">
          <Input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://..."
            aria-label="Image URL"
            className="nodrag nopan flex-1 h-7 px-2 text-xs border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={handleUrlSubmit}
            disabled={!urlValue.trim()}
            className="h-7 px-2 text-xs"
          >
            Load
          </Button>
        </div>
      )}

      {/* Image Preview or Empty State */}
      {nodeData.image ? (
        <div
          className={
            'relative aspect-[4/3] w-full overflow-hidden rounded-md bg-black/20' /* design-system-allow-content-color */
          }
        >
          <Image
            src={nodeData.image}
            alt={nodeData.filename || 'Image'}
            fill
            sizes="300px"
            className="object-contain cursor-pointer"
            unoptimized
          />
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.ICON}
            onClick={handleRemove}
            className="absolute right-1.5 top-1.5 size-5"
          >
            <X className="size-3" />
          </Button>
          {nodeData.dimensions && (
            <div
              className={
                'absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs' /* design-system-allow-content-color */
              }
            >
              {nodeData.dimensions.width}x{nodeData.dimensions.height}
            </div>
          )}
        </div>
      ) : (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 border border-dashed border-border/50 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40 h-auto"
        >
          {isUploading ? (
            <>
              <LoaderCircle className="size-5 text-muted-foreground/50 animate-spin" />
              <span className="text-2xs text-muted-foreground/70">
                Uploading…
              </span>
            </>
          ) : (
            <>
              <ImageIcon className="size-5 text-muted-foreground/50" />
              <span className="text-2xs text-muted-foreground/70">
                Drop or click
              </span>
            </>
          )}
        </Button>
      )}
    </BaseNode>
  );
}

export const ImageInputNode = memo(ImageInputNodeComponent);
