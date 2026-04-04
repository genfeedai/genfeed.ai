// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWorkflowService = vi.hoisted(() => ({
  execute: vi.fn(),
  setThumbnail: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(async () => mockWorkflowService),
}));

const workflowStoreState = vi.hoisted(() => ({
  edges: [],
  nodes: [],
  setWorkflowName: vi.fn(),
  workflowId: 'workflow-123',
  workflowName: 'Workflow',
}));

const mockCloudWorkflowStore = vi.hoisted(() => ({
  saveToCloud: vi.fn(),
}));

vi.mock('@helpers/generation-eta.helper', () => ({
  buildWorkflowEtaSnapshot: vi.fn(() => ({
    estimatedDurationMs: 45_000,
    etaConfidence: 'medium',
  })),
  formatEtaDuration: vi.fn(() => '45s'),
  formatEtaRange: vi.fn(() => '30-60s'),
  shouldDisplayEta: vi.fn(() => true),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectEdges: (state: typeof workflowStoreState) => state.edges,
  selectIsDirty: () => false,
  selectNodes: (state: typeof workflowStoreState) => state.nodes,
  selectWorkflowName: (state: typeof workflowStoreState) => state.workflowName,
  useExecutionStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      actualCost: 0,
      isRunning: false,
    };

    return selector ? selector(state) : state;
  },
  useUIStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      openModal: vi.fn(),
      showPalette: true,
      togglePalette: vi.fn(),
    };

    return selector ? selector(state) : state;
  },
  useWorkflowStore: Object.assign(
    (selector?: (state: typeof workflowStoreState) => unknown) => {
      return selector ? selector(workflowStoreState) : workflowStoreState;
    },
    {
      getState: () => ({
        isDirty: false,
        setWorkflowName: workflowStoreState.setWorkflowName,
        workflowId: workflowStoreState.workflowId,
        workflowName: workflowStoreState.workflowName,
      }),
      subscribe: vi.fn(() => () => {}),
    },
  ),
}));

vi.mock('@genfeedai/workflow-ui/lib', () => ({
  calculateWorkflowCost: vi.fn(() => ({
    items: [{ label: 'Video', subtotal: 6 }],
    total: 6,
  })),
}));

vi.mock('@genfeedai/workflow-ui/hooks', () => ({
  usePaneActions: () => ({
    addNodeAtPosition: vi.fn(),
    autoLayout: vi.fn(),
    fitView: vi.fn(),
    selectAll: vi.fn(),
  }),
}));

vi.mock('@genfeedai/workflow-ui/toolbar', () => ({
  SaveIndicator: () => <div>Saved</div>,
  Toolbar: ({
    logoHref,
    leftContent,
    middleContent,
    rightContent,
    saveIndicator,
  }: {
    logoHref?: string;
    leftContent?: ReactNode;
    middleContent?: ReactNode;
    rightContent?: ReactNode;
    saveIndicator?: ReactNode;
  }) => (
    <div>
      <a href={logoHref}>Logo</a>
      <div>{leftContent}</div>
      <div>File</div>
      <div>{middleContent}</div>
      <div>{saveIndicator}</div>
      <div>{rightContent}</div>
    </div>
  ),
}));

vi.mock('@genfeedai/workflow-ui', () => ({
  WorkflowEditorShell: ({
    rightPanel,
    toolbar,
  }: {
    rightPanel?: ReactNode;
    toolbar?: ReactNode;
  }) => (
    <div>
      <div>{toolbar}</div>
      <div>Shared Workflow Shell</div>
      <div>Workflow Canvas</div>
      <div>Nodes</div>
      <div>Bottom Bar</div>
      <div>Viewport Guard</div>
      <div>{rightPanel}</div>
    </div>
  ),
}));

vi.mock('@genfeedai/workflow-ui/provider', () => ({
  WorkflowUIProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@workflow-cloud/hooks/useCloudWorkflow', () => ({
  useCloudWorkflow: () => ({
    archive: vi.fn(),
    brands: [],
    error: null,
    isLoading: false,
    isSaving: false,
    lifecycle: 'draft' as const,
    publish: vi.fn(),
    save: vi.fn(),
  }),
}));

vi.mock('@workflow-cloud/services/workflow-api', () => ({
  createWorkflowApiService: vi.fn(),
}));

vi.mock('@workflow-cloud/stores/cloud-workflow-store', () => ({
  useCloudWorkflowStore: {
    getState: () => mockCloudWorkflowStore,
  },
}));

vi.mock('@workflow-cloud/components/ExecutionPanel', () => ({
  ExecutionPanel: ({ runId }: { runId?: string }) => (
    <div>{`Execution Panel ${runId ?? ''}`.trim()}</div>
  ),
}));

vi.mock('@workflow-cloud/nodes/merged-node-types', () => ({
  cloudNodeTypes: {},
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

describe('WorkflowEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowService.execute.mockResolvedValue({ _id: 'exec-123' });
    mockCloudWorkflowStore.saveToCloud.mockResolvedValue(undefined);
  });

  it('renders the local shell without throwing', async () => {
    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(<WorkflowEditor workflowId="workflow-123" />);

    expect(screen.getByText('Shared Workflow Shell')).toBeTruthy();
    expect(screen.getByText('Workflow Canvas')).toBeTruthy();
    expect(screen.getByText('Nodes')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Typical run ~45s')).toBeTruthy();
    expect(screen.getByText('600 credits')).toBeTruthy();
    expect(screen.queryByText('Automation')).toBeNull();
  });

  it('opens the execution panel when an initial execution id is provided', async () => {
    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(
      <WorkflowEditor
        workflowId="workflow-123"
        initialExecutionId="exec-pending-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Execution Panel exec-pending-1')).toBeTruthy();
    });
  });

  it('forwards custom navigation controls to the toolbar', async () => {
    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(
      <WorkflowEditor
        workflowId="workflow-123"
        logoHref="/workflows"
        toolbarLeftContent={<span>Back to workflows</span>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Logo' })).toHaveAttribute(
      'href',
      '/workflows',
    );
    expect(screen.getByText('Back to workflows')).toBeTruthy();
  });

  it('runs the workflow through the execution service and opens the execution panel', async () => {
    const { WorkflowEditor } = await import('./WorkflowEditor');

    render(<WorkflowEditor workflowId="workflow-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(mockCloudWorkflowStore.saveToCloud).toHaveBeenCalledWith(
        mockWorkflowService,
      );
    });
    expect(mockWorkflowService.execute).toHaveBeenCalledWith('workflow-123');
    expect(screen.getByText('Execution Panel exec-123')).toBeTruthy();
  });
});
