import { fireEvent, render, screen } from '@testing-library/react';
import { Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableEdge } from './EditableEdge';

const mockSelectEdge = vi.fn();
const mockToggleEdgePause = vi.fn();
const mockRemoveEdge = vi.fn();

const uiState: { selectedEdgeId: string | null } = { selectedEdgeId: null };

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({ selectEdge: mockSelectEdge, ...uiState }),
}));

vi.mock('../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) =>
    selector({
      removeEdge: mockRemoveEdge,
      toggleEdgePause: mockToggleEdgePause,
    }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      deleteEdge: 'Delete edge',
      pauseEdge: 'Pause edge',
      resumeEdge: 'Resume edge',
    };

    return messages[key] ?? key;
  },
}));

vi.mock('@genfeedai/ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    title,
    className,
  }: {
    children: ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    title?: string;
    className?: string;
  }) => (
    <button onClick={onClick} title={title} className={className} type="button">
      {children}
    </button>
  ),
}));

vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...original,
    BaseEdge: (props: {
      interactionWidth?: number;
      path: string;
      style?: React.CSSProperties;
    }) => (
      <path
        data-interaction-width={props.interactionWidth}
        data-testid="base-edge"
        d={props.path}
        style={props.style}
      />
    ),
    // The real EdgeToolbar needs a live ReactFlow store (useStore/useStoreApi)
    // to resolve the edge and current zoom, which this unit test doesn't
    // stand up. Mirror its own `isVisible` gate — including returning null
    // when hidden — so EditableEdge's own visibility logic is what's
    // actually exercised, not the library's internals.
    EdgeToolbar: ({
      children,
      isVisible,
      className,
      onClick,
    }: {
      children: ReactNode;
      isVisible?: boolean;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
    }) =>
      isVisible ? (
        <div data-testid="edge-toolbar" className={className} onClick={onClick}>
          {children}
        </div>
      ) : null,
  };
});

const baseProps = {
  data: {},
  id: 'edge-1',
  markerEnd: undefined,
  selected: false,
  source: 'node-a',
  sourceHandleId: 'output',
  sourcePosition: Position.Right,
  sourceX: 0,
  sourceY: 0,
  style: {},
  target: 'node-b',
  targetHandleId: 'input',
  targetPosition: Position.Left,
  targetX: 100,
  targetY: 0,
} as unknown as React.ComponentProps<typeof EditableEdge>;

describe('EditableEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.selectedEdgeId = null;
  });

  it('gives BaseEdge a real interaction width for mid-edge hit testing', () => {
    render(<EditableEdge {...baseProps} />);

    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-interaction-width',
      '20',
    );
  });

  it('does not render a toolbar when the edge is not selected', () => {
    render(<EditableEdge {...baseProps} selected={false} />);

    expect(screen.queryByTitle('Delete edge')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pause edge')).not.toBeInTheDocument();
  });

  it('does not render a toolbar for a box-selected edge that is not the single selected edge', () => {
    // xyflow marks every edge between box-selected nodes `selected`, but the
    // user only explicitly clicked a different edge (or none at all).
    uiState.selectedEdgeId = 'some-other-edge';
    render(<EditableEdge {...baseProps} selected={true} />);

    expect(screen.queryByTestId('edge-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete edge')).not.toBeInTheDocument();
  });

  it('renders a delete/pause toolbar at the edge midpoint when singly selected', () => {
    uiState.selectedEdgeId = 'edge-1';
    render(<EditableEdge {...baseProps} selected={true} />);

    expect(screen.getByTestId('edge-toolbar')).toBeInTheDocument();
    expect(screen.getByTitle('Delete edge')).toBeInTheDocument();
    expect(screen.getByTitle('Pause edge')).toBeInTheDocument();
  });

  it('deletes the edge and clears selection without opening node config', () => {
    uiState.selectedEdgeId = 'edge-1';
    render(<EditableEdge {...baseProps} selected={true} />);

    fireEvent.click(screen.getByTitle('Delete edge'));

    expect(mockRemoveEdge).toHaveBeenCalledWith('edge-1');
    expect(mockSelectEdge).toHaveBeenCalledWith(null);
  });

  it('toggles pause on the selected edge', () => {
    uiState.selectedEdgeId = 'edge-1';
    render(<EditableEdge {...baseProps} selected={true} />);

    fireEvent.click(screen.getByTitle('Pause edge'));

    expect(mockToggleEdgePause).toHaveBeenCalledWith('edge-1');
  });

  it('shows a resume affordance once the edge is paused', () => {
    uiState.selectedEdgeId = 'edge-1';
    render(
      <EditableEdge {...baseProps} data={{ hasPause: true }} selected={true} />,
    );

    expect(screen.getByTitle('Resume edge')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Resume edge'));
    expect(mockToggleEdgePause).toHaveBeenCalledWith('edge-1');
  });
});
