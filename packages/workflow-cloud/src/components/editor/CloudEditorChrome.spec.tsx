import { fireEvent, render, screen } from '@testing-library/react';
import { CloudNodePalette } from '@workflow-cloud/components/editor/CloudNodePalette';
import { CloudWorkflowToolbar } from '@workflow-cloud/components/editor/CloudWorkflowToolbar';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  autoLayout: vi.fn(),
  exportWorkflow: vi.fn(() => ({
    edges: [],
    name: 'Workflow',
    nodes: [],
  })),
  loadWorkflow: vi.fn(),
  openModal: vi.fn(),
  redo: vi.fn(),
  setWorkflowName: vi.fn(),
  temporalSubscribe: vi.fn(() => () => {}),
  togglePalette: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectIsDirty: () => false,
  selectWorkflowName: () => 'Workflow',
  useUIStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      openModal: stores.openModal,
      togglePalette: stores.togglePalette,
    };

    return selector ? selector(state) : state;
  },
  useWorkflowStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        exportWorkflow: stores.exportWorkflow,
        isDirty: false,
        loadWorkflow: stores.loadWorkflow,
        setWorkflowName: stores.setWorkflowName,
      };

      return selector ? selector(state) : state;
    },
    {
      temporal: {
        getState: () => ({
          futureStates: [],
          pastStates: [],
          redo: stores.redo,
          undo: stores.undo,
        }),
        subscribe: stores.temporalSubscribe,
      },
    },
  ),
}));

vi.mock('@genfeedai/workflow-ui/hooks', () => ({
  usePaneActions: () => ({
    addNodeAtPosition: vi.fn(),
    autoLayout: stores.autoLayout,
    fitView: vi.fn(),
    selectAll: vi.fn(),
  }),
}));

vi.mock('@genfeedai/workflow-ui', () => ({
  NodePalette: () => (
    <div>
      <div>Nodes</div>
      <input placeholder="Search nodes..." />
      <button
        type="button"
        title="Close sidebar (M)"
        onClick={stores.togglePalette}
      >
        Close
      </button>
      <div>Image</div>
    </div>
  ),
}));

vi.mock('@genfeedai/workflow-ui/toolbar', () => ({
  SaveIndicator: () => <div>Saved</div>,
  Toolbar: ({
    leftContent,
    onAutoLayout,
    rightContent,
    saveIndicator,
    onSaveAs,
  }: {
    leftContent?: ReactNode;
    onAutoLayout?: () => void;
    onSaveAs?: (name: string) => Promise<void> | void;
    rightContent?: ReactNode;
    saveIndicator?: ReactNode;
  }) => (
    <div>
      <div>{leftContent}</div>
      <div>File</div>
      <button type="button" onClick={onAutoLayout}>
        Auto layout
      </button>
      <button type="button" onClick={() => void onSaveAs?.('Saved As')}>
        Save As
      </button>
      <div>{saveIndicator}</div>
      <div>{rightContent}</div>
    </div>
  ),
}));

describe('cloud editor chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stores.temporalSubscribe.mockReturnValue(() => {});
  });

  it('renders cloud toolbar right-side content without changing baseline chrome', () => {
    render(
      <CloudWorkflowToolbar
        isSaving={false}
        rightContent={<span>Lifecycle</span>}
      />,
    );

    expect(screen.getByText('File')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Lifecycle')).toBeTruthy();
  });

  it('renders the back control before the title and omits the automation eyebrow', () => {
    render(
      <CloudWorkflowToolbar
        isSaving={false}
        leftContent={<span>Back to workflows</span>}
      />,
    );

    const toolbarText =
      screen.getByText('File').parentElement?.textContent ?? '';

    expect(toolbarText.indexOf('Back to workflows')).toBeLessThan(
      toolbarText.indexOf('Workflow'),
    );
    expect(screen.queryByText('Automation')).toBeNull();
  });

  it('forwards auto-layout to the shared pane actions', () => {
    render(<CloudWorkflowToolbar isSaving={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto layout' }));

    expect(stores.autoLayout).toHaveBeenCalledTimes(1);
  });

  it('commits rename changes through the workflow store and callback', () => {
    const onRename = vi.fn();

    render(<CloudWorkflowToolbar isSaving={false} onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Workflow' }));

    const input = screen.getByDisplayValue('Workflow');
    fireEvent.change(input, { target: { value: 'Renamed Workflow' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(stores.setWorkflowName).toHaveBeenCalledWith('Renamed Workflow');
    expect(onRename).toHaveBeenCalledWith('Renamed Workflow');
  });

  it('renders palette sections and still allows collapsing from the local shell', () => {
    render(<CloudNodePalette />);

    expect(screen.getByText('Nodes')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search nodes...')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Close sidebar (M)'));
    expect(stores.togglePalette).toHaveBeenCalledTimes(1);
  });
});
