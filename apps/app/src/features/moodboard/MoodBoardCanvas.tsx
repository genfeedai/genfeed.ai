'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useDominantColor } from '@genfeedai/hooks/ui/use-dominant-color/use-dominant-color';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { Button } from '@ui/primitives/button';
import { MediaCanvasShell } from '@ui/shell';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowsPointingOut, HiXMark } from 'react-icons/hi2';
import { MediaAssetNode } from '@/features/moodboard/MediaAssetNode';
import type {
  MediaAssetFlowNode,
  MoodBoardCanvasProps,
} from '@/features/moodboard/moodboard.types';

const NODE_TYPES = { mediaAsset: MediaAssetNode };

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

  const assetIndexById = useMemo(
    () => new Map(assets.map((asset, index) => [asset.id, index])),
    [assets],
  );

  const focusedAsset =
    lightboxIndex !== null ? assets[lightboxIndex] : undefined;
  const ambientColor = useDominantColor(
    focusedAsset?.ingredientUrl ?? focusedAsset?.thumbnailUrl,
  );

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
    <>
      <MediaCanvasShell
        title="Mood board"
        meta={isTruncated ? `showing first ${assets.length}` : undefined}
        ambientColor={ambientColor?.rgb ?? null}
        actions={
          <>
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
          </>
        }
      >
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
      </MediaCanvasShell>

      <MediaLightbox
        items={assets}
        startIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </>
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
