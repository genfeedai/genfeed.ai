// @vitest-environment jsdom

import type { WorkflowFile } from '@genfeedai/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunWorkflowConfirmationModal } from '@/components/RunWorkflowConfirmationModal';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { CommandPalette } from './CommandPalette';

const mockOpenModal = vi.fn();
const mockToggleAIGenerator = vi.fn();
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();
const mockWorkflowFile: WorkflowFile = {
  createdAt: new Date().toISOString(),
  description: '',
  edgeStyle: 'default',
  edges: [],
  name: 'Test Workflow',
  nodes: [],
  updatedAt: new Date().toISOString(),
  version: 1,
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-brand', orgSlug: 'acme-org' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/store/commandPaletteStore', async () => {
  const { create } = await import('zustand');

  return {
    useCommandPaletteStore: create<{
      addRecentCommand: (id: string) => void;
      close: () => void;
      isOpen: boolean;
      open: () => void;
      recentCommands: string[];
      reset: () => void;
      searchQuery: string;
      selectedIndex: number;
      setQuery: (query: string) => void;
      setSelectedIndex: (index: number) => void;
      toggle: () => void;
    }>((set) => ({
      addRecentCommand: (id) =>
        set((state) => ({
          recentCommands: [
            id,
            ...state.recentCommands.filter((command) => command !== id),
          ].slice(0, 5),
        })),
      close: () => set({ isOpen: false, searchQuery: '', selectedIndex: 0 }),
      isOpen: false,
      open: () => set({ isOpen: true, searchQuery: '', selectedIndex: 0 }),
      recentCommands: [],
      reset: () => set({ searchQuery: '', selectedIndex: 0 }),
      searchQuery: '',
      selectedIndex: 0,
      setQuery: (query) => set({ searchQuery: query, selectedIndex: 0 }),
      setSelectedIndex: (index) => set({ selectedIndex: index }),
      toggle: () =>
        set((state) => ({
          isOpen: !state.isOpen,
          searchQuery: state.isOpen ? state.searchQuery : '',
          selectedIndex: state.isOpen ? state.selectedIndex : 0,
        })),
    })),
  };
});

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useUIStore: () => ({
    openModal: mockOpenModal,
    toggleAIGenerator: mockToggleAIGenerator,
  }),
}));

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const { useCommandPaletteStore } = await import('@/store/commandPaletteStore');

describe('CommandPalette', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useRunWorkflowConfirmationStore.getState().reset();
    useCommandPaletteStore.setState({
      isOpen: true,
      recentCommands: [],
      searchQuery: '',
      selectedIndex: 0,
    });
    useExecutionStore.setState({
      executeSelectedNodes: vi.fn(),
      executeWorkflow: vi.fn(),
      isRunning: false,
      stopExecution: vi.fn(),
    });
    useWorkflowStore.setState({
      addNode: vi.fn(),
      exportWorkflow: vi.fn(() => mockWorkflowFile),
      selectedNodeIds: [],
    });
    mockOpenModal.mockReset();
    mockToggleAIGenerator.mockReset();
  });

  it('opens confirmation before running the full workflow from the command palette', async () => {
    const executeWorkflow = vi.fn();
    useExecutionStore.setState({ executeWorkflow });

    render(
      <>
        <CommandPalette />
        <RunWorkflowConfirmationModal />
      </>,
    );

    fireEvent.click(screen.getAllByText('Run Workflow')[0]);

    expect(screen.getByText('Run entire workflow?')).toBeInTheDocument();
    expect(executeWorkflow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Run workflow' }));

    await waitFor(() => {
      expect(executeWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  it('runs selected nodes immediately from the command palette', () => {
    const executeSelectedNodes = vi.fn();
    useExecutionStore.setState({ executeSelectedNodes });
    useWorkflowStore.setState({ selectedNodeIds: ['node-1'] });

    render(
      <>
        <CommandPalette />
        <RunWorkflowConfirmationModal />
      </>,
    );

    fireEvent.click(screen.getByText('Run Selected Nodes'));

    expect(executeSelectedNodes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Run entire workflow?')).not.toBeInTheDocument();
  });
});
