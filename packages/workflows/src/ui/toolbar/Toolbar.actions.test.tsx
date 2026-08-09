import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

const stores = vi.hoisted(() => ({
  clearValidationErrors: vi.fn(),
  exportWorkflow: vi.fn(() => ({
    edges: [],
    name: 'My Flow',
    nodes: [],
  })),
  loadWorkflow: vi.fn(),
  openModal: vi.fn(),
  redo: vi.fn(),
  toggleAutoSave: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('../stores/execution', () => ({
  useExecutionStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      clearValidationErrors: stores.clearValidationErrors,
      validationErrors: {
        errors: [
          { message: 'Missing input', nodeId: 'a', severity: 'error' },
          { message: 'Missing input', nodeId: 'b', severity: 'error' },
          { message: 'Cycle detected', nodeId: 'c', severity: 'error' },
        ],
        isValid: false,
        warnings: [],
      },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      autoSaveEnabled: true,
      debugMode: true,
      toggleAutoSave: stores.toggleAutoSave,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { openModal: stores.openModal };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/workflow', () => ({
  useWorkflowStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        exportWorkflow: stores.exportWorkflow,
        isDirty: false,
        isSaving: false,
        loadWorkflow: stores.loadWorkflow,
        workflowName: 'My Flow',
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ loadWorkflow: stores.loadWorkflow }),
      temporal: {
        getState: () => ({
          futureStates: [{}],
          pastStates: [{}],
          redo: stores.redo,
          undo: stores.undo,
        }),
        subscribe: () => () => {},
      },
    },
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Toolbar actions', () => {
  it('undo and redo call the temporal store', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
    fireEvent.click(screen.getByTitle('Redo (Ctrl+Shift+Z)'));

    expect(stores.undo).toHaveBeenCalledTimes(1);
    expect(stores.redo).toHaveBeenCalledTimes(1);
  });

  it('shows the debug badge and opens settings from it', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByText('Debug'));
    expect(stores.openModal).toHaveBeenCalledWith('settings');
  });

  it('opens the settings modal from the settings button', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(stores.openModal).toHaveBeenCalledWith('settings');
  });

  it('opens the shortcut help modal when enabled', () => {
    render(<Toolbar showShortcutHelp={true} />);
    fireEvent.click(screen.getByTitle('Keyboard shortcuts'));
    expect(stores.openModal).toHaveBeenCalledWith('shortcutHelp');
  });

  it('runs auto layout with the LR direction', () => {
    const onAutoLayout = vi.fn();
    render(<Toolbar onAutoLayout={onAutoLayout} />);

    fireEvent.click(screen.getByTitle('Auto-layout nodes'));
    expect(onAutoLayout).toHaveBeenCalledWith('LR');
  });

  it('deduplicates validation error messages and clears them', () => {
    render(<Toolbar />);

    expect(screen.getByText('Cannot run workflow')).toBeInTheDocument();
    expect(screen.getAllByText('Missing input')).toHaveLength(1);
    expect(screen.getByText('Cycle detected')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Dismiss validation errors'));
    expect(stores.clearValidationErrors).toHaveBeenCalledTimes(1);
  });

  it('exports the workflow as a JSON download', () => {
    const createObjectURL = vi.fn(() => 'blob:workflow');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    try {
      render(<Toolbar />);
      fireEvent.click(screen.getByText('File'));
      fireEvent.click(screen.getByText('Export Workflow'));

      expect(stores.exportWorkflow).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:workflow');
    } finally {
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('renders additional menus and opens the Save As dialog', () => {
    const onSaveAs = vi.fn();
    const menuAction = vi.fn();
    render(
      <Toolbar
        additionalMenus={[
          {
            items: [
              {
                icon: <span />,
                id: 'custom',
                label: 'Custom Action',
                onClick: menuAction,
              },
            ],
            label: 'Extras',
          },
        ]}
        onSaveAs={onSaveAs}
      />,
    );

    fireEvent.click(screen.getByText('Extras'));
    fireEvent.click(screen.getByText('Custom Action'));
    expect(menuAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('File'));
    fireEvent.click(screen.getByText('Save As...'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));
    expect(onSaveAs).toHaveBeenCalledWith('My Flow (copy)');
  });
});
