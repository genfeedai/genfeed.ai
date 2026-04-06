'use client';

import type { OutputGalleryNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { ChevronLeft, ChevronRight, Copy, Download, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function OutputGalleryNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as OutputGalleryNodeData;
  const { edges, nodes } = useWorkflowStore(
    useShallow((state) => ({ edges: state.edges, nodes: state.nodes })),
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isLightboxOpen = lightboxIndex !== null;

  const displayImages = useMemo(() => {
    const executionImages = [...(nodeData.images || [])];

    const connectedImages: string[] = [];
    edges
      .filter((edge) => edge.target === id)
      .forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return;

        const sourceData = sourceNode.data as Record<string, unknown>;

        const images = sourceData.outputImages as string[] | undefined;
        if (images?.length) {
          connectedImages.push(...images);
          return;
        }

        const outputImage = sourceData.outputImage as string | null;
        if (outputImage) {
          connectedImages.push(outputImage);
          return;
        }

        const image = sourceData.image as string | null;
        if (image) {
          connectedImages.push(image);
        }
      });

    return [...new Set([...executionImages, ...connectedImages])].reverse();
  }, [nodeData.images, edges, nodes, id]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const imageCountRef = useRef(displayImages.length);
  imageCountRef.current = displayImages.length;

  const navigateLightbox = useCallback((direction: 'prev' | 'next') => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      if (direction === 'prev' && prev > 0) return prev - 1;
      if (direction === 'next' && prev < imageCountRef.current - 1)
        return prev + 1;
      return prev;
    });
  }, []);

  const displayImagesRef = useRef(displayImages);
  displayImagesRef.current = displayImages;

  const downloadImage = useCallback(() => {
    if (lightboxIndex === null) return;
    const image = displayImagesRef.current[lightboxIndex];
    if (!image) return;

    const link = document.createElement('a');
    link.href = image;
    link.download = `gallery-image-${lightboxIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [lightboxIndex]);

  const copyImage = useCallback(async () => {
    if (lightboxIndex === null) return;
    const image = displayImagesRef.current[lightboxIndex];
    if (!image) return;

    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const pngBlob =
        blob.type === 'image/png'
          ? blob
          : await new Promise<Blob>((resolve) => {
              const canvas = document.createElement('canvas');
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                canvas.toBlob((b) => resolve(b || blob), 'image/png');
              };
              img.onerror = () => resolve(blob);
              img.src = image;
            });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ]);
    } catch {
      // Silently fail if clipboard API is unavailable
    }
  }, [lightboxIndex]);

  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          navigateLightbox('prev');
          break;
        case 'ArrowRight':
          navigateLightbox('next');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, closeLightbox, navigateLightbox]);

  return (
    <>
      <BaseNode {...props}>
        {displayImages.length === 0 ? (
          <div className="w-full flex-1 min-h-[200px] border border-dashed border-border rounded flex items-center justify-center">
            <span className="text-muted-foreground text-[10px] text-center px-4">
              Connect image nodes to view gallery
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto nodrag nopan nowheel">
            <div className="grid grid-cols-3 gap-1.5 p-1">
              {displayImages.map((img, idx) => (
                <Button
                  key={img}
                  variant="ghost"
                  onClick={() => openLightbox(idx)}
                  className="aspect-square rounded border border-border hover:border-primary overflow-hidden p-0 h-auto"
                >
                  <img
                    src={img}
                    alt={`Image ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </Button>
              ))}
            </div>
          </div>
        )}
      </BaseNode>

      {isLightboxOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8"
            onClick={closeLightbox}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <div
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={displayImages[lightboxIndex]}
                alt={`Gallery image ${lightboxIndex + 1}`}
                className="max-w-full max-h-[90vh] object-contain rounded"
              />

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={closeLightbox}
                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </Button>

              <div className="absolute top-4 left-4 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadImage}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyImage}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>

              {lightboxIndex > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigateLightbox('prev')}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              )}

              {lightboxIndex < displayImages.length - 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigateLightbox('next')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              )}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded text-white text-xs font-medium">
                {lightboxIndex + 1} / {displayImages.length}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export const OutputGalleryNode = memo(OutputGalleryNodeComponent);
