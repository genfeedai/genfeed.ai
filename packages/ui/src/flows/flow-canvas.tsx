'use client';

import { cn } from '@genfeedai/helpers';
import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  type BackgroundProps,
  BackgroundVariant,
  type ControlProps,
  Controls,
  MiniMap,
  type MiniMapProps,
  ReactFlow,
  type ReactFlowProps,
} from '@xyflow/react';

export type FlowCanvasProps<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
> = ReactFlowProps<NodeType, EdgeType> & {
  backgroundProps?: Partial<BackgroundProps>;
  containerClassName?: string;
  controlsProps?: Partial<ControlProps>;
  miniMapProps?: Partial<MiniMapProps<NodeType>>;
  showBackground?: boolean;
  showControls?: boolean;
  showMiniMap?: boolean;
};

export function FlowCanvas<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>({
  containerClassName,
  className,
  children,
  fitView = true,
  proOptions,
  showBackground = true,
  showControls = true,
  showMiniMap = true,
  backgroundProps,
  controlsProps,
  miniMapProps,
  ...props
}: FlowCanvasProps<NodeType, EdgeType>) {
  const { className: miniMapClassName, ...resolvedMiniMapProps } =
    miniMapProps ?? {};

  return (
    <div
      className={cn(
        'h-[560px] w-full overflow-hidden rounded-xl bg-secondary shadow-dropdown',
        containerClassName,
      )}
    >
      <ReactFlow<NodeType, EdgeType>
        fitView={fitView}
        proOptions={{ hideAttribution: true, ...proOptions }}
        className={cn('bg-transparent text-foreground', className)}
        {...props}
      >
        {children}
        {showBackground ? (
          <Background
            gap={20}
            size={1}
            variant={BackgroundVariant.Dots}
            color="hsl(var(--border))"
            {...backgroundProps}
          />
        ) : null}
        {showControls ? (
          <Controls position="bottom-right" {...controlsProps} />
        ) : null}
        {showMiniMap ? (
          <MiniMap
            pannable
            zoomable
            className={cn('hidden md:block', miniMapClassName)}
            {...resolvedMiniMapProps}
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}
