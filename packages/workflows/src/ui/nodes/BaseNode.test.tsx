import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseNode } from './BaseNode';

// Mock ReactFlow
const mockUpdateNodeInternals = vi.fn();

vi.mock('@xyflow/react', () => ({
  Handle: ({
    className,
    id,
    isConnectableEnd,
    style,
    type,
  }: {
    className?: string;
    id: string;
    isConnectableEnd?: boolean;
    style?: React.CSSProperties;
    type: string;
  }) => (
    <div
      className={className}
      data-connectable-end={String(isConnectableEnd)}
      data-testid={`handle-${type}-${id}`}
      style={style}
    />
  ),
  NodeResizer: ({
    isVisible,
    minHeight,
    minWidth,
  }: {
    isVisible: boolean;
    minHeight: number;
    minWidth: number;
  }) => (
    <div
      data-min-height={minHeight}
      data-min-width={minWidth}
      data-testid="node-resizer"
      data-visible={String(isVisible)}
    />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useUpdateNodeInternals: () => mockUpdateNodeInternals,
}));

// Mock stores
const mockSelectNode = vi.fn();
const mockToggleNodeLock = vi.fn();
const mockIsNodeLocked = vi.fn().mockReturnValue(false);
const mockUpdateNodeData = vi.fn();
const mockExecuteNode = vi.fn();
const mockStopExecution = vi.fn();
const mockStopNodeExecution = vi.fn();
const executionState = {
  activeNodeExecutions: new Set<string>(),
  executeNode: mockExecuteNode,
  isRunning: false,
  stopExecution: mockStopExecution,
  stopNodeExecution: mockStopNodeExecution,
};
const uiState = {
  highlightedNodeIds: [] as string[],
  selectedNodeId: null as string | null,
  selectNode: mockSelectNode,
};

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) => selector(uiState),
}));

vi.mock('../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => {
    const state = {
      isNodeLocked: mockIsNodeLocked,
      toggleNodeLock: mockToggleNodeLock,
      updateNodeData: mockUpdateNodeData,
    };
    return selector(state);
  },
}));

vi.mock('../stores/execution', () => ({
  useExecutionStore: (selector: (state: unknown) => unknown) =>
    selector(executionState),
}));

// Mock child components
vi.mock('./NodeErrorBoundary', () => ({
  NodeErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('./PreviewTooltip', () => ({
  PreviewTooltip: ({
    anchorRect,
    isVisible,
  }: {
    anchorRect: DOMRect | null;
    isVisible: boolean;
  }) => (
    <div
      data-has-anchor={String(Boolean(anchorRect))}
      data-testid="preview-tooltip"
      data-visible={String(isVisible)}
    />
  ),
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
    executionState.activeNodeExecutions = new Set();
    executionState.isRunning = false;
    uiState.highlightedNodeIds = [];
    uiState.selectedNodeId = null;
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

    it('supports a custom definition, title element, disabled input, and resized download dimensions', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{
            color: '#123456',
            label: 'Custom node',
            status: 'idle',
          }}
          disabledInputs={['custom-input']}
          height={320}
          nodeDefinition={
            {
              category: 'custom',
              icon: 'UnknownIcon',
              inputs: [{ id: 'custom-input', type: 'unknown' }],
              label: 'Definition label',
              outputs: [{ id: 'custom-output', type: 'unknown' }],
            } as never
          }
          titleElement={<strong>Custom title</strong>}
          type="download"
          width={260}
        />,
      );

      expect(screen.getByText('Custom title')).toBeInTheDocument();
      expect(screen.getByTestId('handle-target-custom-input')).toHaveAttribute(
        'data-connectable-end',
        'false',
      );
      expect(screen.getByTestId('handle-target-custom-input')).toHaveClass(
        'opacity-30',
      );
      expect(screen.getByTestId('handle-target-custom-input')).toHaveStyle({
        background: 'var(--handle-text)',
      });
      expect(screen.getByTestId('node-resizer')).toHaveAttribute(
        'data-min-width',
        '200',
      );
      expect(screen.getByText('Custom title').closest('.border-2')).toHaveStyle(
        {
          borderColor: '#123456',
          height: '320px',
          width: '260px',
        },
      );
    });

    it('generates schema handles for a selected model', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{
            label: 'Schema node',
            selectedModel: { inputSchema: { prompt: { type: 'string' } } },
            status: 'idle',
          }}
          type="imageGen"
        />,
      );

      expect(screen.getByTestId('handle-target-prompt')).toBeInTheDocument();
    });

    it('falls back through definition and type labels when node data has no label', () => {
      const { rerender } = render(
        <BaseNode
          {...defaultProps}
          data={{ status: 'idle' }}
          nodeDefinition={
            {
              category: 'input',
              icon: 'MessageSquare',
              inputs: [],
              label: 'Definition fallback',
              outputs: [],
            } as never
          }
        />,
      );

      expect(screen.getByText('Definition fallback')).toBeInTheDocument();

      rerender(<BaseNode {...defaultProps} data={{ status: 'idle' }} />);
      expect(screen.getByText('prompt')).toBeInTheDocument();
    });

    it('uses download minimums before a download node is manually resized', () => {
      render(
        <BaseNode
          {...defaultProps}
          nodeDefinition={
            {
              category: 'output',
              icon: 'Download',
              inputs: [],
              label: 'Download',
              outputs: [],
            } as never
          }
          type="download"
        />,
      );

      expect(screen.getByTestId('node-resizer')).toHaveAttribute(
        'data-min-height',
        '280',
      );
      expect(screen.getByText('Test Node').closest('.relative')).toHaveClass(
        'min-w-[200px]',
        'min-h-[280px]',
      );
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

    it('hides the status indicator when requested', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'complete' }}
          hideStatusIndicator
        />,
      );

      expect(document.querySelector('.text-chart-2')).not.toBeInTheDocument();
    });
  });

  describe('execution controls', () => {
    it('retries a failed idle node', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ error: 'Transient failure', label: 'Test', status: 'error' }}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', {
        error: undefined,
        status: 'processing',
      });
      expect(mockExecuteNode).toHaveBeenCalledWith('node-1');
    });

    it('disables retry while the node is executing', () => {
      executionState.activeNodeExecutions = new Set(['node-1']);

      render(
        <BaseNode
          {...defaultProps}
          data={{ error: 'Transient failure', label: 'Test', status: 'error' }}
        />,
      );

      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mockExecuteNode).not.toHaveBeenCalled();
    });

    it('stops the global execution', () => {
      executionState.isRunning = true;

      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'processing' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Stop execution'));
      expect(mockStopExecution).toHaveBeenCalledTimes(1);
    });

    it('stops only the independently executing node', () => {
      executionState.activeNodeExecutions = new Set(['node-1']);

      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'processing' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Stop node'));
      expect(mockStopNodeExecution).toHaveBeenCalledWith('node-1');
    });

    it('resets a stale processing status when nothing is running', () => {
      render(
        <BaseNode
          {...defaultProps}
          data={{ label: 'Test', status: 'processing' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Reset node'));
      expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', {
        error: undefined,
        status: 'idle',
      });
    });

    it('copies the node error through the clipboard API', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      render(
        <BaseNode
          {...defaultProps}
          data={{ error: 'Copy this error', label: 'Test', status: 'error' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Copy error'));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('Copy this error');
      });
    });

    it('falls back to a temporary textarea when the clipboard API is unavailable', async () => {
      const execCommand = vi.fn().mockReturnValue(true);
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });

      render(
        <BaseNode
          {...defaultProps}
          data={{ error: 'Fallback copy', label: 'Test', status: 'error' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Copy error'));
      await waitFor(() => {
        expect(execCommand).toHaveBeenCalledWith('copy');
      });
      expect(document.querySelector('textarea')).not.toBeInTheDocument();
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

    it('uses store selection and dims nodes outside the highlighted set', () => {
      uiState.selectedNodeId = 'node-1';
      uiState.highlightedNodeIds = ['another-node'];

      const { rerender } = render(<BaseNode {...defaultProps} />);
      expect(
        screen.getByText('Test Node').closest('.ring-1'),
      ).toBeInTheDocument();

      uiState.selectedNodeId = null;
      rerender(<BaseNode {...defaultProps} title="Test Node" />);
      expect(
        screen.getByText('Test Node').closest('.opacity-40'),
      ).toBeInTheDocument();
    });

    it('keeps a node fully opaque when it belongs to the highlighted set', () => {
      uiState.highlightedNodeIds = ['node-1'];

      render(<BaseNode {...defaultProps} />);

      expect(
        screen.getByText('Test Node').closest('.opacity-40'),
      ).not.toBeInTheDocument();
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

  describe('preview behavior', () => {
    it('shows the preview after the hover delay and hides it on leave', () => {
      vi.useFakeTimers();
      try {
        render(<BaseNode {...defaultProps} />);
        const node = screen.getByText('Test Node').closest('.relative');
        expect(node).not.toBeNull();

        fireEvent.pointerEnter(node as Element);
        act(() => {
          vi.advanceTimersByTime(300);
        });

        expect(screen.getByTestId('preview-tooltip')).toHaveAttribute(
          'data-visible',
          'true',
        );
        expect(screen.getByTestId('preview-tooltip')).toHaveAttribute(
          'data-has-anchor',
          'true',
        );

        fireEvent.pointerLeave(node as Element);
        expect(screen.getByTestId('preview-tooltip')).toHaveAttribute(
          'data-visible',
          'false',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears a pending hover timer on leave and unmount', () => {
      vi.useFakeTimers();
      try {
        const view = render(<BaseNode {...defaultProps} />);
        const node = screen.getByText('Test Node').closest('.relative');
        expect(node).not.toBeNull();

        fireEvent.pointerLeave(node as Element);
        fireEvent.pointerEnter(node as Element);
        fireEvent.pointerLeave(node as Element);
        expect(screen.getByTestId('preview-tooltip')).toHaveAttribute(
          'data-visible',
          'false',
        );

        fireEvent.pointerEnter(node as Element);
        view.unmount();
        act(() => {
          vi.runAllTimers();
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('memoization', () => {
    const changedProps: Array<Partial<ComponentProps<typeof BaseNode>>> = [
      { selected: true },
      { id: 'node-2' },
      { type: 'imageGen' },
      { width: 260 },
      { height: 300 },
      { headerActions: <button type="button">Changed action</button> },
      { title: 'Changed title' },
      { titleElement: <strong>Changed title element</strong> },
      { hideStatusIndicator: true },
      {
        nodeDefinition: {
          category: 'input',
          icon: 'MessageSquare',
          inputs: [],
          label: 'Custom definition',
          outputs: [{ id: 'text', type: 'text' }],
        } as never,
      },
      { disabledInputs: ['one'] },
      {
        data: { ...defaultProps.data, status: 'processing' },
      },
      { data: { ...defaultProps.data, progress: 50 } },
      { data: { ...defaultProps.data, error: 'Changed error' } },
      { data: { ...defaultProps.data, label: 'Changed label' } },
      { data: { ...defaultProps.data, color: '#abcdef' } },
      { children: <span>Changed child</span> },
    ];

    it.each(changedProps)(
      're-renders when a meaningful prop changes',
      (change) => {
        const view = render(<BaseNode {...defaultProps} />);
        mockIsNodeLocked.mockClear();

        view.rerender(<BaseNode {...defaultProps} {...change} />);

        expect(mockIsNodeLocked).toHaveBeenCalled();
      },
    );

    it('skips a render when all meaningful props remain equal', () => {
      const stableData = { ...defaultProps.data };
      const view = render(<BaseNode {...defaultProps} data={stableData} />);
      mockIsNodeLocked.mockClear();

      view.rerender(<BaseNode {...defaultProps} data={stableData} />);

      expect(mockIsNodeLocked).not.toHaveBeenCalled();
    });

    it('re-renders when a disabled input changes at the same array position', () => {
      const view = render(
        <BaseNode {...defaultProps} disabledInputs={['first']} />,
      );
      mockIsNodeLocked.mockClear();

      view.rerender(<BaseNode {...defaultProps} disabledInputs={['second']} />);

      expect(mockIsNodeLocked).toHaveBeenCalled();
    });

    it('skips a render for equivalent disabled input arrays', () => {
      const view = render(
        <BaseNode {...defaultProps} disabledInputs={['first']} />,
      );
      mockIsNodeLocked.mockClear();

      view.rerender(<BaseNode {...defaultProps} disabledInputs={['first']} />);

      expect(mockIsNodeLocked).not.toHaveBeenCalled();
    });
  });
});
