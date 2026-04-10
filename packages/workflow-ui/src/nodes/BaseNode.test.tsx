import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseNode } from './BaseNode';

// Mock ReactFlow
vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id: string; type: string }) => (
    <div data-testid={`handle-${type}-${id}`} />
  ),
  NodeResizer: () => null,
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useUpdateNodeInternals: () => vi.fn(),
}));

// Mock stores
const mockSelectNode = vi.fn();
const mockToggleNodeLock = vi.fn();
const mockIsNodeLocked = vi.fn().mockReturnValue(false);
const mockUpdateNodeData = vi.fn();

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) => {
    const state = {
      highlightedNodeIds: [],
      selectedNodeId: null,
      selectNode: mockSelectNode,
    };
    return selector(state);
  },
}));

vi.mock('../stores/workflowStore', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => {
    const state = {
      isNodeLocked: mockIsNodeLocked,
      toggleNodeLock: mockToggleNodeLock,
      updateNodeData: mockUpdateNodeData,
    };
    return selector(state);
  },
}));

vi.mock('../stores/executionStore', () => ({
  useExecutionStore: (selector: (state: unknown) => unknown) => {
    const state = {
      activeNodeExecutions: new Set(),
      executeNode: vi.fn(),
      isRunning: false,
    };
    return selector(state);
  },
}));

// Mock child components
vi.mock('./NodeErrorBoundary', () => ({
  NodeErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('./PreviewTooltip', () => ({
  PreviewTooltip: () => null,
}));

// Mock schema handles utility
vi.mock('../lib/schemaHandles', () => ({
  generateHandlesFromSchema: vi.fn(
    (_schema: unknown, staticInputs: unknown[]) => staticInputs,
  ),
}));

// Mock UI components
vi.mock('../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
    className,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    title?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
    >
      {children}
    </button>
  ),
}));

// Mock NODE_DEFINITIONS and NodeStatusEnum
vi.mock('@genfeedai/types', () => ({
  NODE_DEFINITIONS: {
    imageGen: {
      category: 'ai',
      icon: 'Sparkles',
      inputs: [{ id: 'prompt', type: 'text' }],
      name: 'Image Gen',
      outputs: [{ id: 'image', type: 'image' }],
    },
    output: {
      category: 'output',
      icon: 'CheckCircle',
      inputs: [{ id: 'media', type: 'image' }],
      name: 'Output',
      outputs: [],
    },
    prompt: {
      category: 'input',
      icon: 'MessageSquare',
      inputs: [],
      name: 'Prompt',
      outputs: [{ id: 'text', type: 'text' }],
    },
  },
  NodeStatusEnum: {
    COMPLETE: 'complete',
    ERROR: 'error',
    IDLE: 'idle',
    PENDING: 'pending',
    PROCESSING: 'processing',
  },
}));

describe('BaseNode', () => {
  const defaultProps = {
    data: {
      label: 'Test Node',
      status: 'idle',
    },
    deletable: true,
    draggable: true,
    dragging: false,
    dragHandle: '',
    id: 'node-1',
    isConnectable: true,
    parentId: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: false,
    type: 'prompt',
    zIndex: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNodeLocked.mockReturnValue(false);
  });

  describe('rendering', () => {
    it('should render node with label', () => {
      render(<BaseNode {...defaultProps} />);

      expect(screen.getByText('Test Node')).toBeInTheDocument();
    });

    it('should render children', () => {
      render(
        <BaseNode {...defaultProps}>
          <div data-testid="child-content">Child Content</div>
        </BaseNode>,
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('should normalize fragment children and header actions without key warnings', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      render(
        <BaseNode
          {...defaultProps}
          headerActions={
            <>
              <button type="button">Action 1</button>
              <button type="button">Action 2</button>
            </>
          }
        >
          <div>Child A</div>
          <div>Child B</div>
        </BaseNode>,
      );

      expect(screen.getByText('Action 1')).toBeInTheDocument();
      expect(screen.getByText('Action 2')).toBeInTheDocument();
      expect(screen.getByText('Child A')).toBeInTheDocument();
      expect(screen.getByText('Child B')).toBeInTheDocument();
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'Each child in a list should have a unique "key" prop',
        ),
        expect.anything(),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should render input handles for imageGen node', () => {
      render(<BaseNode {...defaultProps} type="imageGen" />);

      expect(screen.getByTestId('handle-target-prompt')).toBeInTheDocument();
    });

    it('should render output handles for prompt node', () => {
      render(<BaseNode {...defaultProps} type="prompt" />);

      expect(screen.getByTestId('handle-source-text')).toBeInTheDocument();
    });

    it('should not render for unknown node type', () => {
      const { container } = render(
        <BaseNode {...defaultProps} type="unknown" />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('status indicators', () => {
    it('should show processing spinner when status is processing', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'processing' }}
        />,
      );

      // Check for processing indicator: animate-spin class, node-processing wrapper, or SVG element from Loader2
      const spinner = document.querySelector('.animate-spin');
      const processingNode = document.querySelector('.node-processing');
      const svgIcon = document.querySelector('svg');
      expect(spinner ?? processingNode ?? svgIcon).toBeTruthy();
    });

    it('should show check icon when status is complete', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'complete' }}
        />,
      );

      // Complete status shows CheckCircle2
      expect(document.querySelector('.text-chart-2')).toBeInTheDocument();
    });

    it('should show error icon when status is error', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'error' }}
        />,
      );

      expect(document.querySelector('.text-destructive')).toBeInTheDocument();
    });

    it('should show progress bar when processing with progress', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', progress: 50, status: 'processing' }}
        />,
      );

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should show error message when error is present', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{
            error: 'Something went wrong',
            label: 'Test',
            status: 'error',
          }}
        />,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should call selectNode when clicked', () => {
      render(<BaseNode {...defaultProps} />);

      const nodeElement = screen.getByText('Test Node').closest('div');
      expect(nodeElement).not.toBeNull();

      fireEvent.pointerDown(nodeElement as Element);

      expect(mockSelectNode).toHaveBeenCalledWith('node-1');
    });

    it('should apply ring style when selected', () => {
      render(<BaseNode {...defaultProps} selected={true} />);

      const node = screen.getByText('Test Node').closest('.ring-1');
      expect(node).toBeInTheDocument();
    });
  });

  describe('locking', () => {
    it('should show unlock button by default', () => {
      render(<BaseNode {...defaultProps} />);

      expect(screen.getByTitle('Lock node (L)')).toBeInTheDocument();
    });

    it('should show lock button when locked', () => {
      mockIsNodeLocked.mockReturnValue(true);

      render(<BaseNode {...defaultProps} />);

      expect(screen.getByTitle('Unlock node (L)')).toBeInTheDocument();
    });

    it('should show LOCKED badge when locked', () => {
      mockIsNodeLocked.mockReturnValue(true);

      render(<BaseNode {...defaultProps} />);

      expect(screen.getByText('LOCKED')).toBeInTheDocument();
    });

    it('should toggle lock when lock button clicked', () => {
      render(<BaseNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Lock node (L)'));

      expect(mockToggleNodeLock).toHaveBeenCalledWith('node-1');
    });

    it('should not propagate click event when toggling lock', () => {
      render(<BaseNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Lock node (L)'));

      // selectNode should not be called since we stopPropagation
      expect(mockSelectNode).not.toHaveBeenCalled();
    });
  });

  describe('category rendering', () => {
    it('should render prompt node with input category', () => {
      render(<BaseNode {...defaultProps} type="prompt" />);

      expect(screen.getByText('Test Node')).toBeInTheDocument();
    });

    it('should render imageGen node with ai category', () => {
      render(<BaseNode {...defaultProps} type="imageGen" />);

      // imageGen uses the Sparkles icon mapping and renders correctly
      expect(screen.getByTestId('handle-target-prompt')).toBeInTheDocument();
      expect(screen.getByTestId('handle-source-image')).toBeInTheDocument();
    });

    it('should render output node with output category', () => {
      render(<BaseNode {...defaultProps} type="output" />);

      expect(screen.getByTestId('handle-target-media')).toBeInTheDocument();
    });
  });
});
