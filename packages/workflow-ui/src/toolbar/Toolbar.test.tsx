import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

const stores = vi.hoisted(() => ({
  clearValidationErrors: vi.fn(),
  exportWorkflow: vi.fn(() => ({
    edges: [],
    name: 'Workflow',
    nodes: [],
  })),
  loadWorkflow: vi.fn(),
  openModal: vi.fn(),
  toggleAutoSave: vi.fn(),
}));

vi.mock('../stores/executionStore', () => ({
  useExecutionStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      clearValidationErrors: stores.clearValidationErrors,
      validationErrors: null,
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
      debugMode: false,
      toggleAutoSave: stores.toggleAutoSave,
    };

    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      openModal: stores.openModal,
    };

    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/workflowStore', () => ({
  useWorkflowStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        exportWorkflow: stores.exportWorkflow,
        isDirty: false,
        isSaving: false,
        loadWorkflow: stores.loadWorkflow,
        workflowName: 'Shared Workflow',
      };

      return selector ? selector(state) : state;
    },
    {
      temporal: {
        getState: () => ({
          futureStates: [],
          pastStates: [],
          redo: vi.fn(),
          undo: vi.fn(),
        }),
        subscribe: () => () => {},
      },
    },
  ),
}));

describe('Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders shared slots around the canonical toolbar chrome', () => {
    render(
      <Toolbar
        leftContent={<div>Workflow Metadata</div>}
        middleContent={<div>Estimated Cost</div>}
        rightContent={<div>Lifecycle Actions</div>}
        showShortcutHelp
      />,
    );

    expect(screen.getByText('Workflow Metadata')).toBeTruthy();
    expect(screen.getByText('File')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Estimated Cost')).toBeTruthy();
    expect(screen.getByText('Lifecycle Actions')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Keyboard shortcuts'));
    expect(stores.openModal).toHaveBeenCalledWith('shortcutHelp');
  });
});
