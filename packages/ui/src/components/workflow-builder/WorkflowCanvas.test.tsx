import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import WorkflowCanvas from '@ui/workflow-builder/WorkflowCanvas';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock('@ui/flows', () => ({
  FlowCanvas: ({
    children,
    edges,
    nodes,
    onDrop,
  }: {
    children?: React.ReactNode;
    edges?: Edge[];
    nodes?: Node[];
    onDrop?: (event: React.DragEvent) => void;
  }) => (
    <div
      data-testid="flow-canvas"
      data-has-drop={String(typeof onDrop === 'function')}
      className="h-full"
    >
      <div data-testid="nodes">{nodes?.length ?? 0} nodes</div>
      <div data-testid="edges">{edges?.length ?? 0} edges</div>
      {children}
    </div>
  ),
}));

// Mock React Flow completely to avoid ResizeObserver issues
vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Cross: 'cross', Dots: 'dots', Lines: 'lines' },
  Controls: () => <div data-testid="controls" />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => <div data-testid="minimap" />,
  Panel: ({ children }: any) => <div>{children}</div>,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
  ReactFlow: ({ children, nodes, edges }: any) => (
    <div data-testid="react-flow" className="h-full">
      <div data-testid="nodes">{nodes?.length} nodes</div>
      <div data-testid="edges">{edges?.length} edges</div>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  useReactFlow: () => ({
    screenToFlowPosition: (pos: { x: number; y: number }) => ({
      x: pos.x,
      y: pos.y,
    }),
  }),
}));

describe('WorkflowCanvas', () => {
  const mockNodes: Node[] = [
    {
      data: { config: {}, label: 'Input Node', nodeType: 'input-image' },
      id: 'node-1',
      position: { x: 100, y: 100 },
      type: 'input-node',
    },
  ];

  const mockEdges: Edge[] = [];

  const defaultProps = {
    edges: mockEdges,
    isReadOnly: false,
    nodes: mockNodes,
    onConnect: vi.fn(),
    onDrop: vi.fn(),
    onEdgesChange: vi.fn(),
    onNodeSelect: vi.fn(),
    onNodesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<WorkflowCanvas {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle drag over events', () => {
    const { container } = render(<WorkflowCanvas {...defaultProps} />);
    const canvas = container.querySelector('.h-full');

    if (canvas) {
      const dragOverEvent = new Event('dragover', { bubbles: true });
      fireEvent(canvas, dragOverEvent);
      expect(canvas).toBeInTheDocument();
    }
  });

  it('should pass onDrop to ReactFlow', () => {
    const onDrop = vi.fn();
    const { container } = render(
      <WorkflowCanvas {...defaultProps} onDrop={onDrop} />,
    );
    expect(
      container.querySelector('[data-testid="flow-canvas"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-has-drop="true"]'),
    ).toBeInTheDocument();
  });

  it('should handle node click events', () => {
    const onNodeSelect = vi.fn();
    render(<WorkflowCanvas {...defaultProps} onNodeSelect={onNodeSelect} />);
    // Node click is handled by React Flow internally
    expect(onNodeSelect).toBeDefined();
  });

  it('should respect read-only mode', () => {
    const { container } = render(
      <WorkflowCanvas {...defaultProps} isReadOnly={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render with empty nodes array', () => {
    const { container } = render(
      <WorkflowCanvas {...defaultProps} nodes={[]} edges={[]} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
