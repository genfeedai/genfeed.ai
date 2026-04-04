import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptNode } from './PromptNode';

// Mock ReactFlow
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock BaseNode to simplify testing
vi.mock('../BaseNode', () => ({
  BaseNode: ({
    children,
    titleElement,
    headerActions,
  }: {
    children: React.ReactNode;
    titleElement?: React.ReactNode;
    headerActions?: React.ReactNode;
  }) => (
    <div data-testid="base-node">
      {titleElement}
      {headerActions}
      {children}
    </div>
  ),
}));

// Mock provider-injected PromptPicker
vi.mock('../../provider', () => ({
  useWorkflowUIConfig: () => ({
    PromptPicker: ({
      onSelect,
    }: {
      onSelect: (item: { promptText: string }) => void;
    }) => (
      <button
        data-testid="prompt-picker"
        onClick={() => onSelect({ promptText: 'Library prompt' })}
      >
        Pick Prompt
      </button>
    ),
  }),
}));

// Mock stores
const mockUpdateNodeData = vi.fn();
const mockOpenCreateModal = vi.fn();

vi.mock('../../stores/workflowStore', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => {
    const state = { edges: [], updateNodeData: mockUpdateNodeData };
    return selector(state);
  },
}));

vi.mock('../../stores/promptLibraryStore', () => ({
  usePromptLibraryStore: () => ({
    openCreateModal: mockOpenCreateModal,
  }),
}));

vi.mock('../../stores/promptEditorStore', () => ({
  usePromptEditorStore: () => ({
    openEditor: vi.fn(),
  }),
}));

describe('PromptNode', () => {
  const defaultProps = {
    data: {
      label: 'Prompt',
      prompt: '',
      status: 'idle',
    },
    deletable: true,
    draggable: true,
    dragging: false,
    dragHandle: '',
    id: 'prompt-1',
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
  });

  describe('rendering', () => {
    it('should render textarea', () => {
      render(<PromptNode {...defaultProps} />);

      expect(
        screen.getByPlaceholderText('Enter your prompt...'),
      ).toBeInTheDocument();
    });

    it('should render prompt picker', () => {
      render(<PromptNode {...defaultProps} />);

      expect(screen.getByTestId('prompt-picker')).toBeInTheDocument();
    });

    it('should render save button', () => {
      render(<PromptNode {...defaultProps} />);

      expect(screen.getByTitle('Save to library')).toBeInTheDocument();
    });

    it('should display existing prompt value', () => {
      render(
        <PromptNode
          {...defaultProps}
          data={{ ...defaultProps.data, prompt: 'Existing prompt' }}
        />,
      );

      expect(screen.getByDisplayValue('Existing prompt')).toBeInTheDocument();
    });
  });

  describe('prompt editing', () => {
    it('should update node data when prompt changes', () => {
      render(<PromptNode {...defaultProps} />);

      const textarea = screen.getByPlaceholderText('Enter your prompt...');
      fireEvent.change(textarea, { target: { value: 'New prompt' } });

      expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-1', {
        prompt: 'New prompt',
      });
    });
  });

  describe('prompt library integration', () => {
    it('should update prompt when selecting from library', () => {
      render(<PromptNode {...defaultProps} />);

      fireEvent.click(screen.getByTestId('prompt-picker'));

      expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-1', {
        prompt: 'Library prompt',
      });
    });

    it('should open save modal when save button clicked with prompt', () => {
      render(
        <PromptNode
          {...defaultProps}
          data={{ ...defaultProps.data, prompt: 'My prompt' }}
        />,
      );

      fireEvent.click(screen.getByTitle('Save to library'));

      expect(mockOpenCreateModal).toHaveBeenCalledWith(
        expect.objectContaining({
          promptText: 'My prompt',
        }),
      );
    });

    it('should not open save modal when prompt is empty', () => {
      render(<PromptNode {...defaultProps} />);

      fireEvent.click(screen.getByTitle('Save to library'));

      expect(mockOpenCreateModal).not.toHaveBeenCalled();
    });

    it('should disable save button when prompt is empty', () => {
      render(<PromptNode {...defaultProps} />);

      const saveButton = screen.getByTitle('Save to library');
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when prompt has content', () => {
      render(
        <PromptNode
          {...defaultProps}
          data={{ ...defaultProps.data, prompt: 'Some prompt' }}
        />,
      );

      const saveButton = screen.getByTitle('Save to library');
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('tooltip', () => {
    it('should have title attribute on save button', () => {
      render(<PromptNode {...defaultProps} />);

      const saveButton = screen.getByTitle('Save to library');
      expect(saveButton).toHaveAttribute('title', 'Save to library');
    });

    it('should have title attribute on expand button', () => {
      render(<PromptNode {...defaultProps} />);

      const expandButton = screen.getByTitle('Expand editor');
      expect(expandButton).toHaveAttribute('title', 'Expand editor');
    });
  });
});
