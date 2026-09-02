'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMoodBoard } from '@genfeedai/hooks/data/content/use-mood-board/use-mood-board';
import { useDominantColor } from '@genfeedai/hooks/ui/use-dominant-color/use-dominant-color';
import type { IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import type { LibraryCanvasProps } from '@genfeedai/props/content/library-canvas.props';
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
import { Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { LibraryCanvasNode } from './LibraryCanvasNode';
import type { LibraryCanvasFlowNode } from './library-canvas.types';
import { useLibraryCanvasNodes } from './use-library-canvas-nodes';

const NODE_TYPES = { libraryAsset: LibraryCanvasNode };

function LibraryCanvasInner({
  ingredients,
  isLoading = false,
}: LibraryCanvasProps): React.JSX.Element {
  const translate = useTranslations('common.libraryCanvas');
  const { fitView } = useReactFlow();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { board, save } = useMoodBoard();
  const savedLayout = useMemo(() => board?.layout ?? [], [board?.layout]);

  const handlePersist = useCallback(
    (layout: IMoodBoardLayoutItem[]) => {
      void save(layout);
    },
    [save],
  );

  const { nodes, onNodesChange, onNodeDragStop } = useLibraryCanvasNodes({
    ingredients,
    onPersist: handlePersist,
    savedLayout,
  });

  const ingredientIndexById = useMemo(
    () =>
      new Map(ingredients.map((ingredient, index) => [ingredient.id, index])),
    [ingredients],
  );

  const focusedIngredient =
    lightboxIndex !== null ? ingredients[lightboxIndex] : undefined;
  const ambientColor = useDominantColor(
    focusedIngredient?.ingredientUrl ?? focusedIngredient?.thumbnailUrl,
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: LibraryCanvasFlowNode) => {
      const index = ingredientIndexById.get(node.id);
      if (index !== undefined) {
        setLightboxIndex(index);
      }
    },
    [ingredientIndexById],
  );

  return (
    <>
      <MediaCanvasShell
        ambientColor={ambientColor?.rgb ?? null}
        toolbarClassName="p-3"
        actions={
          <div
            data-testid="library-canvas-actions"
            className="gen-glass flex items-center gap-0.5 rounded-lg p-0.5"
          >
            {isLoading ? (
              <span className="px-2 text-xs text-foreground/55">
                {translate('loading', { count: ingredients.length })}
              </span>
            ) : null}
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              ariaLabel={translate('fitBoard')}
              tooltip={translate('fit')}
              withWrapper={false}
              className="size-7"
              icon={<Maximize2 className="size-3.5" />}
              onClick={() => fitView({ duration: 300 })}
            />
          </div>
        }
      >
        <ReactFlow<LibraryCanvasFlowNode>
          className="library-canvas-flow bg-background"
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
            color="hsl(var(--foreground) / 0.08)"
          />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={1}
            nodeColor="hsl(var(--secondary))"
            nodeStrokeColor="hsl(var(--border-strong, var(--border)))"
            maskColor="hsl(var(--background) / 0.55)"
            style={{ backgroundColor: 'hsl(var(--secondary))' }}
            className="!m-3 overflow-hidden rounded-lg !bg-secondary !shadow-dropdown"
          />
        </ReactFlow>
      </MediaCanvasShell>

      <MediaLightbox
        items={ingredients}
        startIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

export default function LibraryCanvas(
  props: LibraryCanvasProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <LibraryCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
