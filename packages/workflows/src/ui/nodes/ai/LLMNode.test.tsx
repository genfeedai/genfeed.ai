import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMNode } from './LLMNode';

// Mock ReactFlow
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock BaseNode - render both children and headerActions
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

// Mock stores
const mockUpdateNodeData = vi.fn();
const mockOpenNodeDetailModal = vi.fn();

vi.mock('../../stores/workflow', () => ({
  useWorkflowStore: Object.assign(
    (selector: (state: unknown) => unknown) => {
      const state = {
        edges: [],
        getConnectedInputs: vi.fn().mockReturnValue({}),
        nodes: [],
        updateNodeData: mockUpdateNodeData,
      };
      return selector(state);
    },
    { getState: () => ({ updateNodeData: mockUpdateNodeData }) },
  ),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) => {
    const state = { openNodeDetailModal: mockOpenNodeDetailModal };
    return selector(state);
  },
}));

// Mock UI components
vi.mock('@genfeedai/ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}));

// Mock hooks used by the component
const mockHandleGenerate = vi.fn();

vi.mock('../../hooks/useCanGenerate', () => ({
  useCanGenerate: () => ({
    canGenerate: true,
    hasConnectedData: true,
    hasRequiredConnections: true,
    hasRequiredSchemaFields: true,
    missingItems: [],
  }),
}));

vi.mock('../../hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    handleGenerate: mockHandleGenerate,
    handleStop: vi.fn(),
  }),
}));

vi.mock('../../hooks/useAutoLoadModelSchema', () => ({
  useAutoLoadModelSchema: vi.fn(),
}));

vi.mock('../../hooks/useModelSelection', () => ({
  useModelSelection: () => ({
    handleModelSelect: vi.fn(),
  }),
}));

vi.mock('../../lib/models/registry', () => ({
  DEFAULT_LLM_MODEL: 'meta-llama-3.1-405b-instruct',
  LLM_MODEL_ID_MAP: {},
  LLM_MODEL_MAP: {},
  LLM_MODELS: [
    {
      apiId: 'meta/meta-llama-3.1-405b-instruct',
      label: 'Llama 3.1 405B',
      value: 'meta-llama-3.1-405b-instruct',
    },
  ],
}));

vi.mock('@/components/models/ModelBrowserModal', () => ({
  // Note: ModelBrowserModal is provided by consuming app via WorkflowUIProvider
  ModelBrowserModal: () => null,
}));

// Mock Slider to be a native range input
vi.mock('@genfeedai/ui/primitives/slider', () => ({
  Slider: ({
    value,
    min,
    max,
    step,
    onValueChange,
    className,
  }: {
    value: number[];
    min: number;
    max: number;
    step: number;
    onValueChange: (value: number[]) => void;
    className?: string;
  }) => (
    <input
      type="range"
      aria-valuenow={value[0]}
      value={value[0]}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange([parseFloat(e.target.value)])}
      className={className}
    />
  ),
}));

describe('LLMNode', () => {
  const defaultProps = {
    data: {
      label: 'LLM',
      maxTokens: 1024,
      status: 'idle',
      systemPrompt: '',
      temperature: 0.7,
    },
    deletable: true,
    draggable: true,
    dragging: false,
    dragHandle: '',
    id: 'llm-1',
    isConnectable: true,
    parentId: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: false,
    type: 'llm',
    zIndex: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render temperature slider', () => {
      render(<LLMNode {...defaultProps} />);

      expect(screen.getByText(/Temperature:/)).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should render max tokens input', () => {
      render(<LLMNode {...defaultProps} />);

      expect(screen.getByText('Max Tokens')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });
  });

  describe('system prompt', () => {
    it('should update node data when system prompt changes', () => {
      render(<LLMNode {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        "Define the AI's behavior...",
      );
      fireEvent.change(textarea, {
        target: { value: 'You are a helpful assistant' },
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith('llm-1', {
        systemPrompt: 'You are a helpful assistant',
      });
    });
  });

  describe('temperature', () => {
    it('should update node data when temperature changes', () => {
      render(<LLMNode {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1.5' } });

      expect(mockUpdateNodeData).toHaveBeenCalledWith('llm-1', {
        temperature: 1.5,
      });
    });

    it('should show Precise and Creative labels', () => {
      render(<LLMNode {...defaultProps} />);

      expect(screen.getByText('Precise')).toBeInTheDocument();
      expect(screen.getByText('Creative')).toBeInTheDocument();
    });
  });

  describe('max tokens', () => {
    it('should update node data when max tokens changes', () => {
      render(<LLMNode {...defaultProps} />);

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '2048' } });

      expect(mockUpdateNodeData).toHaveBeenCalledWith('llm-1', {
        maxTokens: 2048,
      });
    });
  });

  describe('generate button', () => {
    it('should call handleGenerate when generate button clicked', () => {
      render(
        <LLMNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            inputPrompt: 'Tell me a story',
            systemPrompt: 'You are helpful',
          }}
        />,
      );

      fireEvent.click(screen.getByText('Generate'));

      expect(mockHandleGenerate).toHaveBeenCalled();
    });

    it('should show Generating text as stop button when processing', () => {
      render(
        <LLMNode
          {...defaultProps}
          data={{ ...defaultProps.data, status: 'processing' }}
        />,
      );

      expect(screen.getByText('Generating')).toBeInTheDocument();
      // The Generating button is a stop button (destructive variant), not disabled
      expect(
        screen.getByRole('button', { name: /generating/i }),
      ).toBeInTheDocument();
    });
  });

  describe('output display', () => {
    it('should disable refresh button when processing', () => {
      render(
        <LLMNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            outputText: 'Generated output',
            status: 'processing',
          }}
        />,
      );

      const refreshButton = screen.getByTitle('Regenerate');
      expect(refreshButton).toBeDefined();
      expect(refreshButton).toBeDisabled();
    });
  });
});
