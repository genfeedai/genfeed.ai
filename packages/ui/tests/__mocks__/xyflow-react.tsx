import type * as React from 'react';

export enum BackgroundVariant {
  Dots = 'dots',
}

export enum Position {
  Left = 'left',
  Right = 'right',
  Top = 'top',
  Bottom = 'bottom',
}

export function ReactFlowProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function ReactFlow({
  children,
  onNodeClick,
  onPaneClick,
}: {
  children?: React.ReactNode;
  onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  onPaneClick?: () => void;
}) {
  return (
    <div data-testid="react-flow">
      <button
        type="button"
        data-testid="react-flow-node"
        onClick={(event) => onNodeClick?.(event, { id: 'mock-node' })}
      />
      <button
        type="button"
        data-testid="react-flow-pane"
        onClick={() => onPaneClick?.()}
      />
      {children}
    </div>
  );
}

export function Background() {
  return <div data-testid="react-flow-background" />;
}

export function Controls() {
  return <div data-testid="react-flow-controls" />;
}

export function MiniMap() {
  return <div data-testid="react-flow-minimap" />;
}

export function Handle({ id, type }: { id?: string; type?: string }) {
  return <div data-testid={`handle-${type ?? 'unknown'}-${id ?? 'default'}`} />;
}

export function useReactFlow() {
  return {
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  };
}
