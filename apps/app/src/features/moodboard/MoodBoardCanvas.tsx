'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useDominantColor } from '@genfeedai/hooks/ui/use-dominant-color/use-dominant-color';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { Button } from '@ui/primitives/button';
import { MediaCanvasShell } from '@ui/shell';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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
        ambientColor={ambientColor?.rgb ?? null}
        toolbarClassName="p-3"
        actions={
          <div
            data-testid="moodboard-actions"
            className="gen-glass flex items-center gap-0.5 rounded-lg p-0.5"
          >
            {isTruncated ? (
              <span className="px-2 text-xs text-foreground/55">
                First {assets.length}
              </span>
            ) : null}
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              ariaLabel="Fit board"
              tooltip="Fit"
              withWrapper={false}
              className="size-7"
              icon={<Maximize2 className="size-3.5" />}
              onClick={() => fitView({ duration: 300 })}
            />
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              ariaLabel="Close moodboard"
              tooltip="Close"
              withWrapper={false}
              className="size-7"
              icon={<X className="size-3.5" />}
              onClick={onClose}
            />
          </div>
        }
      >
        <ReactFlow<MediaAssetFlowNode>
          className="moodboard-flow bg-background"
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
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={1}
            nodeColor="oklch(1 0 0 / 0.14)"
            nodeStrokeColor="oklch(1 0 0 / 0.22)"
            maskColor="oklch(0 0 0 / 0.55)"
            style={{ backgroundColor: 'var(--secondary)' }}
            className="!m-3 overflow-hidden rounded-lg !border !border-border !bg-secondary !shadow-dropdown"
          />
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
