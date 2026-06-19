'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { Button } from '@ui/primitives/button';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowsPointingOut, HiXMark } from 'react-icons/hi2';
import { MediaAssetNode } from '@/features/moodboard/MediaAssetNode';
import type { MediaAssetFlowNode } from '@/features/moodboard/moodboard.types';

const NODE_TYPES = { mediaAsset: MediaAssetNode };

export interface MoodBoardCanvasProps {
  assets: IIngredient[];
  nodes: MediaAssetFlowNode[];
  onNodesChange: (changes: NodeChange<MediaAssetFlowNode>[]) => void;
  onNodeDragStop: () => void;
  onClose: () => void;
  isTruncated?: boolean;
}

function MoodBoardCanvasInner({
  assets,
  nodes,
  onNodesChange,
  onNodeDragStop,
  onClose,
  isTruncated,
}: MoodBoardCanvasProps): React.JSX.Element {
  const { fitView } = useReactFlow();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const assetIndexById = useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach((asset, index) => {
      map.set(asset.id, index);
    });
    return map;
  }, [assets]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: MediaAssetFlowNode) => {
      const index = assetIndexById.get(node.id);
      if (index !== undefined) {
        setLightboxIndex(index);
      }
    },
    [assetIndexById],
  );

  return (
    <div className="relative h-full w-full gen-grain gen-vignette">
      <ReactFlow<MediaAssetFlowNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={handleNodeClick}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable
        fitView
        minZoom={0.05}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements={nodes.length > 50}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
        <Controls showInteractive={false} />
        <MiniMap nodeStrokeWidth={0} pannable zoomable />
      </ReactFlow>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto gen-glass flex items-center gap-2 rounded-full px-3 py-1.5">
          <span className="text-sm font-medium text-foreground/90">
            Mood board
          </span>
          {isTruncated && (
            <span className="text-xs text-foreground/55">
              showing first {assets.length}
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            variant={ButtonVariant.GHOST}
            icon={<HiArrowsPointingOut className="text-lg" />}
            label="Fit"
            onClick={() => fitView({ duration: 300 })}
          />
          <Button
            variant={ButtonVariant.GHOST}
            icon={<HiXMark className="text-lg" />}
            label="Close"
            onClick={onClose}
          />
        </div>
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={assets}
          startIndex={lightboxIndex}
          open={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

export default function MoodBoardCanvas(
  props: MoodBoardCanvasProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <MoodBoardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
