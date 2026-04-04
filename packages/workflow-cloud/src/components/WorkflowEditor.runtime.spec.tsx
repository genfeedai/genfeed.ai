import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  selectEdges: vi.fn(),
  selectNodes: vi.fn(),
  useWorkflowStore: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui', () => ({
  WorkflowEditorShell: ({ toolbar }: { toolbar?: React.ReactNode }) => (
    <div data-testid="workflow-editor-shell">{toolbar}</div>
  ),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectEdges: stores.selectEdges,
  selectNodes: stores.selectNodes,
  useWorkflowStore: stores.useWorkflowStore,
}));

vi.mock('@workflow-cloud/components/ExecutionPanel', () => ({
  ExecutionPanel: () => <div data-testid="execution-panel" />,
}));

vi.mock('@workflow-cloud/components/editor/CloudWorkflowToolbar', () => ({
  CloudWorkflowToolbar: () => <div data-testid="workflow-toolbar" />,
}));

vi.mock('@workflow-cloud/hooks/useCloudWorkflow', () => ({
  useCloudWorkflow: () => ({
    archive: vi.fn(),
    error: null,
    isLoading: false,
    isSaving: false,
    lifecycle: 'draft',
    publish: vi.fn(),
  }),
}));

vi.mock('@workflow-cloud/nodes/merged-node-types', () => ({
  cloudNodeTypes: {},
}));

describe('WorkflowEditor runtime smoke test', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stores.selectNodes.mockReturnValue([]);
    stores.selectEdges.mockReturnValue([]);
    stores.useWorkflowStore.mockImplementation(
      (
        selector?: (state: { nodes: unknown[]; edges: unknown[] }) => unknown,
      ) => {
        const state = { edges: [], nodes: [] };
        return selector ? selector(state) : state;
      },
    );
  });

  it('renders without throwing when the shared shell is stubbed', async () => {
    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(<WorkflowEditor workflowId="workflow-123" />);

    expect(screen.getByTestId('workflow-editor-shell')).toBeTruthy();
    expect(screen.getByTestId('workflow-toolbar')).toBeTruthy();
  });

  it('renders when workflow selectors return undefined', async () => {
    stores.selectNodes.mockReturnValue(undefined);
    stores.selectEdges.mockReturnValue(undefined);

    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(<WorkflowEditor workflowId="workflow-123" />);

    expect(screen.getByTestId('workflow-editor-shell')).toBeTruthy();
    expect(screen.getByTestId('workflow-toolbar')).toBeTruthy();
  });
});
