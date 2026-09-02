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
  className,
  onNodeClick,
  onPaneClick,
}: {
  children?: React.ReactNode;
  className?: string;
  onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  onPaneClick?: () => void;
}) {
  return (
    <div className={className} data-testid="react-flow">
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

export function MiniMap({ className }: { className?: string }) {
  return <div className={className} data-testid="react-flow-minimap" />;
}

export function Handle({ id, type }: { id?: string; type?: string }) {
  return <div data-testid={`handle-${type ?? 'unknown'}-${id ?? 'default'}`} />;
}

export function useReactFlow() {
  return {
    fitView: () => {},
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  };
}

type MockNode = { id: string; position: { x: number; y: number } };
type MockNodeChange =
  | { id: string; type: 'position'; position?: { x: number; y: number } }
  | { id: string; type: 'remove' }
  | { item: MockNode; type: 'add' };

/**
 * Enough of the real reducer for node-state hooks under test: position moves
 * and add/remove. Layout math belongs to the code under test, not the mock.
 */
export function applyNodeChanges<TNode extends MockNode>(
  changes: MockNodeChange[],
  nodes: TNode[],
): TNode[] {
  let current = nodes;

  for (const change of changes) {
    if (change.type === 'add') {
      current = [...current, change.item as TNode];
      continue;
    }

    if (change.type === 'remove') {
      current = current.filter((node) => node.id !== change.id);
      continue;
    }

    current = current.map((node) =>
      node.id === change.id && change.position
        ? { ...node, position: change.position }
        : node,
    );
  }

  return current;
}
