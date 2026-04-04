import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageGenNode } from './ImageGenNode';

// Mock ReactFlow
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock BaseNode - render headerActions so buttons are accessible in tests
vi.mock('../BaseNode', () => ({
  BaseNode: ({
    children,
    headerActions,
    titleElement,
  }: {
    children: React.ReactNode;
    headerActions?: React.ReactNode;
    titleElement?: React.ReactNode;
  }) => (
    <div data-testid="base-node">
      <div data-testid="title-element">{titleElement}</div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}));

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="next-image" />
  ),
}));

// Mock provider-injected UI config
vi.mock('../../provider', () => ({
  useWorkflowUIConfig: () => ({
    ModelBrowserModal: ({
      isOpen,
      onClose,
      onSelect,
    }: {
      isOpen: boolean;
      onClose: () => void;
      onSelect: (model: {
        id: string;
        provider: string;
        displayName: string;
      }) => void;
    }) =>
      isOpen ? (
        <div data-testid="model-browser">
          <button onClick={onClose} data-testid="close-modal">
            Close
          </button>
          <button
            onClick={() =>
              onSelect({
                displayName: 'Nano Banana Pro',
                id: 'google/nano-banana-pro',
                provider: 'replicate',
              })
            }
            data-testid="select-model"
          >
            Select Model
          </button>
        </div>
      ) : null,
  }),
}));

// Mock UI components
vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('../../ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => (
    <label>{children}</label>
  ),
}));

// Mock hooks used by the component
const mockHandleGenerate = vi.fn();
const mockHandleModelSelect = vi.fn();

vi.mock('../../hooks/useAutoLoadModelSchema', () => ({
  useAutoLoadModelSchema: vi.fn(),
}));

vi.mock('../../hooks/useModelSelection', () => ({
  useModelSelection: () => ({
    handleModelSelect: mockHandleModelSelect,
  }),
}));

vi.mock('../../hooks/useCanGenerate', () => ({
  useCanGenerate: () => ({
    canGenerate: true,
  }),
}));

vi.mock('../../hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    handleGenerate: mockHandleGenerate,
  }),
}));

// Mock model registry
vi.mock('../../lib/models/registry', () => ({
  DEFAULT_IMAGE_MODEL: 'nano-banana',
  IMAGE_MODEL_ID_MAP: {},
  IMAGE_MODEL_MAP: {},
  IMAGE_MODELS: [{ label: 'Nano Banana', value: 'nano-banana' }],
}));

// Mock schema utilities
vi.mock('../../lib/schemaUtils', () => ({
  extractEnumValues: vi.fn().mockReturnValue({}),
  supportsImageInput: vi.fn().mockReturnValue(false),
}));

// Mock SchemaInputs - renders nothing since inputs are dynamic
vi.mock('../SchemaInputs', () => ({
  SchemaInputs: () => null,
}));

// Mock core constants
vi.mock('@genfeedai/core', () => ({
  ASPECT_RATIOS: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  OUTPUT_FORMATS: ['jpg', 'png', 'webp'],
  RESOLUTIONS: ['1K', '2K', '4K'],
}));

// Mock stores
const mockUpdateNodeData = vi.fn();

vi.mock('../../stores/workflowStore', () => ({
  useWorkflowStore: Object.assign(
    (selector: (state: unknown) => unknown) => {
      const state = {
        edges: [],
        getConnectedInputs: vi.fn().mockReturnValue({}),
        getNodeById: vi.fn().mockReturnValue(undefined),
        nodes: [],
        updateNodeData: mockUpdateNodeData,
      };
      return selector(state);
    },
    {
      getState: () => ({
        getNodeById: vi.fn(),
        updateNodeData: mockUpdateNodeData,
      }),
    },
  ),
}));

vi.mock('../../stores/executionStore', () => ({
  useExecutionStore: (selector: (state: unknown) => unknown) => {
    const state = { executeNode: vi.fn(), isRunning: false };
    return selector(state);
  },
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) => {
    const state = { openNodeDetailModal: vi.fn() };
    return selector(state);
  },
}));

describe('ImageGenNode', () => {
  const defaultProps = {
    data: {
      aspectRatio: '1:1',
      inputImages: [],
      label: 'Image Gen',
      model: 'nano-banana',
      outputFormat: 'jpg',
      resolution: '2K',
      status: 'idle',
    },
    deletable: true,
    draggable: true,
    dragging: false,
    dragHandle: '',
    id: 'imagegen-1',
    isConnectable: true,
    parentId: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: false,
    type: 'imageGen',
    zIndex: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the base node', () => {
      render(<ImageGenNode {...defaultProps} />);

      expect(screen.getByTestId('base-node')).toBeInTheDocument();
    });

    it('should render the model name as clickable browse trigger', () => {
      render(<ImageGenNode {...defaultProps} />);

      expect(screen.getByTitle('Browse models')).toBeInTheDocument();
    });

    it('should render generate button with correct text', () => {
      render(<ImageGenNode {...defaultProps} />);

      expect(screen.getByText('Generate')).toBeInTheDocument();
    });
  });

  describe('model selection', () => {
    it('should open model browser when model name clicked', () => {
      render(<ImageGenNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Browse models'));

      expect(screen.getByTestId('model-browser')).toBeInTheDocument();
    });

    it('should close model browser when close clicked', () => {
      render(<ImageGenNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Browse models'));
      fireEvent.click(screen.getByTestId('close-modal'));

      expect(screen.queryByTestId('model-browser')).not.toBeInTheDocument();
    });

    it('should call handleModelSelect when model selected from browser', () => {
      render(<ImageGenNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Browse models'));
      fireEvent.click(screen.getByTestId('select-model'));

      expect(mockHandleModelSelect).toHaveBeenCalledWith({
        displayName: 'Nano Banana Pro',
        id: 'google/nano-banana-pro',
        provider: 'replicate',
      });
    });
  });

  describe('generate button', () => {
    it('should call handleGenerate when generate button clicked', () => {
      render(<ImageGenNode {...defaultProps} />);

      fireEvent.click(screen.getByText('Generate'));

      expect(mockHandleGenerate).toHaveBeenCalled();
    });

    it('should show Generating text when processing', () => {
      render(
        <ImageGenNode
          {...defaultProps}
          data={{ ...defaultProps.data, status: 'processing' }}
        />,
      );

      expect(screen.getByText('Generating')).toBeInTheDocument();
      expect(screen.queryByText('Generate')).not.toBeInTheDocument();
    });
  });

  describe('output display', () => {
    it('should display output image when available', () => {
      render(
        <ImageGenNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            outputImage: 'https://example.com/image.png',
          }}
        />,
      );

      expect(screen.getByTestId('next-image')).toBeInTheDocument();
      expect(screen.getByAltText('Generated image')).toBeInTheDocument();
    });

    it('should show expand button when output image exists', () => {
      render(
        <ImageGenNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            outputImage: 'https://example.com/image.png',
          }}
        />,
      );

      expect(screen.getByTitle('Expand preview')).toBeInTheDocument();
    });

    it('should render action buttons with output', () => {
      render(
        <ImageGenNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            outputImage: 'https://example.com/image.png',
          }}
        />,
      );

      const buttons = screen.getAllByTestId('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
