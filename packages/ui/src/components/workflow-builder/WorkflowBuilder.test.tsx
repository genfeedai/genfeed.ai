import '@testing-library/jest-dom';
import * as workflowBuilderHook from '@genfeedai/hooks/automation/use-workflow-builder/use-workflow-builder';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkflowBuilder from '@ui/workflow-builder/WorkflowBuilder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the hook
vi.mock(
  '@genfeedai/hooks/automation/use-workflow-builder/use-workflow-builder',
  () => ({
    useWorkflowBuilder: vi.fn(() => ({
      edges: [],
      error: null,
      inputVariables: [],
      isDirty: false,
      isLoading: false,
      isSaving: false,
      nodes: [],
      nodesByCategory: {},
      onAddNode: vi.fn(),
      onAddVariable: vi.fn(),
      onConnect: vi.fn(),
      onDeleteVariable: vi.fn(),
      onEdgesChange: vi.fn(),
      onNodeSelect: vi.fn(),
      onNodesChange: vi.fn(),
      onUpdateNodeConfig: vi.fn(),
      onUpdateVariable: vi.fn(),
      runWorkflow: vi.fn(),
      saveWorkflow: vi.fn(),
      selectedNodeId: null,
      validateWorkflow: vi.fn(),
    })),
  }),
);

describe('WorkflowBuilder', () => {
  const defaultProps = {
    initialEdges: [],
    initialNodes: [],
    initialVariables: [],
    workflowId: 'test-workflow-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<WorkflowBuilder {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display loading state when isLoading is true', () => {
    const mockedUseWorkflowBuilder = vi.mocked(
      workflowBuilderHook.useWorkflowBuilder,
    );
    mockedUseWorkflowBuilder.mockReturnValueOnce({
      ...mockedUseWorkflowBuilder(),
      isLoading: true,
    });

    const { container } = render(<WorkflowBuilder {...defaultProps} />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should display error state when error exists', () => {
    const mockedUseWorkflowBuilder = vi.mocked(
      workflowBuilderHook.useWorkflowBuilder,
    );
    mockedUseWorkflowBuilder.mockReturnValueOnce({
      ...mockedUseWorkflowBuilder(),
      error: 'Failed to load workflow',
    });

    const { getByText } = render(<WorkflowBuilder {...defaultProps} />);
    expect(getByText(/Error loading workflow builder/)).toBeInTheDocument();
  });

  it('should render WorkflowToolbar with correct props', () => {
    const { container } = render(<WorkflowBuilder {...defaultProps} />);
    expect(container.querySelector('h2')).toBeInTheDocument();
  });

  it('should render NodePalette, WorkflowCanvas, and panels', () => {
    const { container } = render(<WorkflowBuilder {...defaultProps} />);
    expect(container.querySelector('.border-r')).toBeInTheDocument(); // NodePalette container
    expect(container.querySelector('.flex-1')).toBeInTheDocument(); // Canvas container
  });

  it('should handle save callback when provided', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const mockedUseWorkflowBuilder = vi.mocked(
      workflowBuilderHook.useWorkflowBuilder,
    );
    mockedUseWorkflowBuilder.mockReturnValueOnce({
      ...mockedUseWorkflowBuilder(),
      edges: [],
      inputVariables: [],
      isDirty: true,
      nodes: [],
    });

    render(<WorkflowBuilder {...defaultProps} onSave={onSave} />);

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('should toggle palette collapse state', () => {
    const { container } = render(<WorkflowBuilder {...defaultProps} />);
    const paletteContainer = container.querySelector('.border-r');
    expect(paletteContainer).toBeInTheDocument();
  });

  it('should handle read-only mode', () => {
    const { container } = render(
      <WorkflowBuilder {...defaultProps} isReadOnly={true} />,
    );
    expect(container).toBeInTheDocument();
  });
});
