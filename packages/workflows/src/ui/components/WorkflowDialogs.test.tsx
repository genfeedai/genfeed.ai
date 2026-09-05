import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeSearch } from '../canvas/NodeSearch';
import { ShortcutHelpModal } from '../canvas/ShortcutHelpModal';
import { SaveAsDialog } from '../toolbar/SaveAsDialog';
import { CostModal } from './CostModal';

const state = vi.hoisted(() => ({
  activeModal: 'cost',
  closeModal: vi.fn(),
}));
vi.mock('../stores/uiStore', () => ({ useUIStore: () => state }));
vi.mock('../stores/workflow', () => ({
  useWorkflowStore: (
    selector?: (value: {
      nodes: [];
      setSelectedNodeIds: () => void;
    }) => unknown,
  ) => {
    const value = { nodes: [] as [], setSelectedNodeIds: vi.fn() };
    return selector ? selector(value) : value;
  },
}));
vi.mock('../stores/execution', () => ({
  useExecutionStore: (selector: (value: { actualCost: number }) => unknown) =>
    selector({ actualCost: 0 }),
}));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

describe('shared workflow dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['cost', 'Cost Breakdown', CostModal],
    ['nodeSearch', 'Find Node', NodeSearch],
    ['shortcutHelp', 'Keyboard Shortcuts', ShortcutHelpModal],
  ] as const)(
    'gives %s shared modal semantics and Escape handling',
    async (activeModal, title, Component) => {
      state.activeModal = activeModal;
      render(
        <>
          <button type="button">Outside dialog</button>
          <Component />
        </>,
      );
      const dialog = screen.getByRole('dialog', { name: title });
      expect(
        screen
          .getByRole('button', { name: 'Outside dialog', hidden: true })
          .closest('[aria-hidden="true"]'),
      ).not.toBeNull();
      expect(dialog.querySelector('button button')).toBeNull();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(state.closeModal).toHaveBeenCalledTimes(1));
    },
  );

  it('focuses Find Node search when its portal opens', async () => {
    state.activeModal = 'nodeSearch';
    render(<NodeSearch />);
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Search nodes' }),
      ).toHaveFocus(),
    );
  });

  it('preserves Save As focus, validation, and trimmed submission', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <SaveAsDialog
        isOpen
        currentName="My Flow"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    const name = screen.getByRole('textbox', { name: 'Workflow Name' });
    await waitFor(() => expect(name).toHaveFocus());
    fireEvent.change(name, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(name, { target: { value: '  Copy  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('Copy');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
