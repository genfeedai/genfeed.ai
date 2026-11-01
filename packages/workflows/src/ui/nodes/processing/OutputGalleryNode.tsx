'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { OutputGalleryNodeData } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@genfeedai/ui/primitives/dialog';
import type { NodeProps } from '@xyflow/react';
import { ChevronLeft, ChevronRight, Copy, Download } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../../stores/workflow';
import { BaseNode } from '../BaseNode';

function OutputGalleryNodeComponent(props: NodeProps) {
  const translate = useTranslations('pages.workflows.outputGallery');
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
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    for (const edge of edges) {
      if (edge.target !== id) continue;

      const sourceNode = nodesById.get(edge.source);
      if (!sourceNode) continue;

      const sourceData = sourceNode.data as Record<string, unknown>;

      const images = sourceData.outputImages as string[] | undefined;
      if (images?.length) {
        connectedImages.push(...images);
        continue;
      }

      const outputImage = sourceData.outputImage as string | null;
      if (outputImage) {
        connectedImages.push(outputImage);
        continue;
      }

      const image = sourceData.image as string | null;
      if (image) {
        connectedImages.push(image);
      }
    }

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

  const handleLightboxKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      // The dialog is portalled but React still bubbles its events to the
      // canvas, so key presses stop here.
      e.stopPropagation();

      if (e.key === 'ArrowLeft') {
        navigateLightbox('prev');
      } else if (e.key === 'ArrowRight') {
        navigateLightbox('next');
      }
    },
    [navigateLightbox],
  );

  return (
    <>
      <BaseNode {...props}>
        {displayImages.length === 0 ? (
          <div className="w-full flex-1 min-h-[200px] border border-dashed border-border rounded flex items-center justify-center">
            <span className="text-muted-foreground text-2xs text-center px-4">
              {translate('connectImages')}
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto nodrag nopan nowheel">
            <div className="grid grid-cols-3 gap-1.5 p-1">
              {displayImages.map((img, idx) => (
                <Button
                  withWrapper={false}
                  key={img}
                  variant={ButtonVariant.GHOST}
                  onClick={() => openLightbox(idx)}
                  className="aspect-square rounded border border-border hover:border-primary overflow-hidden p-0 h-auto"
                >
                  <NextImage
                    src={img}
                    alt={translate('resultAlt', { index: idx + 1 })}
                    fill
                    className="size-full object-cover"
                    sizes="80px"
                    unoptimized
                  />
                </Button>
              ))}
            </div>
          </div>
        )}
      </BaseNode>

      <Dialog
        open={isLightboxOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeLightbox();
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          // Right-clicks bubble through the portal to the canvas menu.
          onContextMenu={(e) => e.stopPropagation()}
          onKeyDown={handleLightboxKeyDown}
          size="2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {translate('lightboxTitle', {
                index: (lightboxIndex ?? 0) + 1,
                total: displayImages.length,
              })}
            </DialogTitle>
          </DialogHeader>

          <DialogBody scrollable={false}>
            {lightboxIndex !== null && displayImages[lightboxIndex] ? (
              <div className="relative flex items-center justify-center">
                <NextImage
                  src={displayImages[lightboxIndex]}
                  alt={translate('resultAlt', { index: lightboxIndex + 1 })}
                  width={1200}
                  height={800}
                  className="max-h-[60dvh] w-auto max-w-full rounded object-contain"
                  unoptimized
                />

                {lightboxIndex > 0 && (
                  <Button
                    ariaLabel={translate('previous')}
                    withWrapper={false}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.ICON}
                    onClick={() => navigateLightbox('prev')}
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                )}

                {lightboxIndex < displayImages.length - 1 && (
                  <Button
                    ariaLabel={translate('next')}
                    withWrapper={false}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.ICON}
                    onClick={() => navigateLightbox('next')}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                )}
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={downloadImage}
            >
              <Download className="size-3.5" />
              {translate('download')}
            </Button>
            <Button
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={copyImage}
            >
              <Copy className="size-3.5" />
              {translate('copy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const OutputGalleryNode = memo(OutputGalleryNodeComponent);
