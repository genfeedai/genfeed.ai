'use client';

import type { ImageCompareNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from 'react-compare-slider';
import { useWorkflowStore } from '../../stores/workflowStore';
import { BaseNode } from '../BaseNode';

function ImageCompareNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as ImageCompareNodeData;
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);

  // Collect images in real-time from connected nodes
  const displayImages = useMemo(() => {
    const connectedImages: string[] = [];

    // Get edges connected to this node, sorted by creation time for stable ordering
    const sortedEdges = edges
      .filter((edge) => edge.target === id)
      .sort((a, b) => {
        const aTime = (a.data?.createdAt as number) || 0;
        const bTime = (b.data?.createdAt as number) || 0;
        return aTime - bTime;
      });

    sortedEdges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return;

      const sourceData = sourceNode.data as Record<string, unknown>;
      let image: string | null = null;

      if (sourceNode.type === 'imageInput') {
        image = sourceData.image as string | null;
      } else if (sourceNode.type === 'annotation') {
        image = sourceData.outputImage as string | null;
      } else if (sourceNode.type === 'imageGen') {
        image = sourceData.outputImage as string | null;
      }

      if (image) {
        connectedImages.push(image);
      }
    });

    return connectedImages;
  }, [edges, nodes, id]);

  const imageA = displayImages[0] || nodeData.imageA || null;
  const imageB = displayImages[1] || nodeData.imageB || null;

  return (
    <BaseNode {...props}>
      {/* Comparison view or placeholder */}
      {imageA && imageB ? (
        <div className="flex-1 relative nodrag nopan nowheel min-h-[200px]">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={imageA}
                alt="Image A"
                style={{ objectFit: 'contain' }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={imageB}
                alt="Image B"
                style={{ objectFit: 'contain' }}
              />
            }
            portrait={false}
            style={{ height: '100%', width: '100%' }}
          />
          {/* Corner labels */}
          <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-medium px-2 py-1 rounded pointer-events-none">
            A
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-medium px-2 py-1 rounded pointer-events-none">
            B
          </div>
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[200px] border border-dashed border-border rounded flex flex-col items-center justify-center gap-2">
          <span className="text-muted-foreground text-[10px] text-center px-4">
            {!imageA && !imageB
              ? 'Connect 2 images to compare'
              : 'Connect another image to compare'}
          </span>
          {imageA && !imageB && (
            <div className="text-[9px] text-muted-foreground">
              Image A connected
            </div>
          )}
          {!imageA && imageB && (
            <div className="text-[9px] text-muted-foreground">
              Image B connected
            </div>
          )}
        </div>
      )}
    </BaseNode>
  );
}

export const ImageCompareNode = memo(ImageCompareNodeComponent);
