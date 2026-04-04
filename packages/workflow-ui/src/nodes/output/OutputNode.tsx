'use client';

import type { DownloadNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Clock, Download, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useState } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { BaseNode } from '../BaseNode';

/**
 * Extract file extension from URL or use fallback based on input type
 */
function getExtensionFromUrl(url: string, inputType: string): string {
  try {
    const urlPath = new URL(url).pathname;
    const match = urlPath.match(/\.(\w+)(?:\?.*)?$/);
    if (match) {
      const ext = match[1].toLowerCase();
      // Normalize common extensions
      if (ext === 'jpeg') return 'jpg';
      if (['jpg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'].includes(ext)) {
        return ext;
      }
    }
  } catch {
    // Invalid URL, use fallback
  }
  // Fallback based on input type
  if (inputType === 'video') return 'mp4';
  if (inputType === 'image') return 'jpg';
  return 'txt';
}

function DownloadNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as DownloadNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const [isDownloading, setIsDownloading] = useState(false);
  const isConnected = edges.some((edge) => edge.target === id);

  // Determine active input (image or video, whichever is connected)
  const activeMedia = nodeData.inputVideo || nodeData.inputImage;
  const activeType = nodeData.inputVideo
    ? 'video'
    : nodeData.inputImage
      ? 'image'
      : null;

  const fileExtension = activeMedia
    ? getExtensionFromUrl(activeMedia, activeType || 'image')
    : 'png';

  const handleFilenameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData<DownloadNodeData>(id, { outputName: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleDownload = useCallback(async () => {
    if (!activeMedia || isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch the file as a blob to bypass cross-origin restrictions
      const response = await fetch(activeMedia);
      const blob = await response.blob();

      // Create object URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${nodeData.outputName || 'output'}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (_error) {
      // Fallback: open in new tab if fetch fails
      window.open(activeMedia, '_blank');
    } finally {
      setIsDownloading(false);
    }
  }, [activeMedia, nodeData.outputName, fileExtension, isDownloading]);

  return (
    <BaseNode {...props}>
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {activeMedia ? (
          <>
            {/* Preview */}
            {activeType === 'video' ? (
              <div className="relative aspect-video min-h-[120px] w-full overflow-hidden rounded-md bg-black/20">
                <video
                  src={activeMedia}
                  className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                {nodeData.status === 'processing' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-xs text-white/80">
                        Processing...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : activeType === 'image' ? (
              <div className="relative aspect-[4/3] min-h-[120px] w-full overflow-hidden rounded-md bg-black/20">
                <Image
                  src={activeMedia}
                  alt="Output"
                  fill
                  sizes="300px"
                  className="object-contain cursor-pointer"
                  unoptimized
                />
                {nodeData.status === 'processing' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-xs text-white/80">
                        Processing...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-[60px] overflow-y-auto rounded-md border border-border bg-background p-2 text-sm">
                {String(activeMedia)}
              </div>
            )}

            {/* Editable filename */}
            <div className="flex items-center gap-1">
              <Input
                value={nodeData.outputName || 'output'}
                onChange={handleFilenameChange}
                className="h-8 flex-1 text-sm"
                placeholder="filename"
              />
              <span className="text-xs text-muted-foreground">
                .{fileExtension}
              </span>
            </div>

            {/* Download button */}
            <Button
              className="w-full"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </>
        ) : isConnected && isRunning ? (
          <div className="relative flex h-20 flex-col items-center justify-center rounded-md bg-black/20">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-white/80">Generating...</span>
            </div>
          </div>
        ) : isConnected ? (
          <div className="flex h-20 flex-col items-center justify-center text-muted-foreground">
            <Clock className="mb-2 h-6 w-6 opacity-30" />
            <span className="text-xs">Waiting for input...</span>
            <span className="mt-1 text-[10px] opacity-60">
              Run workflow to generate
            </span>
          </div>
        ) : (
          <div className="flex h-20 flex-col items-center justify-center text-muted-foreground">
            <Download className="mb-2 h-6 w-6 opacity-30" />
            <span className="text-xs">Connect image or video</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const DownloadNode = memo(DownloadNodeComponent);

/** @deprecated Use DownloadNode instead */
export const OutputNode = DownloadNode;
