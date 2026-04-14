// @vitest-environment jsdom

import type { WorkflowFile } from '@genfeedai/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const mockPush = vi.fn();
const mockOpenModal = vi.fn();
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
  useRouter: () => ({ push: mockPush }),
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
  }),
}));

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const { useCommandPaletteStore } = await import('@/store/commandPaletteStore');

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useRunWorkflowConfirmationStore.getState().reset();
    useCommandPaletteStore.setState({ isOpen: false });
    useExecutionStore.setState({
      executeSelectedNodes: vi.fn(),
      executeWorkflow: vi.fn(),
      isRunning: false,
    });
    useWorkflowStore.setState({
      exportWorkflow: vi.fn(() => mockWorkflowFile),
      selectedNodeIds: [],
    });
    mockPush.mockReset();
    mockOpenModal.mockReset();
  });

  it('opens confirmation instead of immediately running on Cmd/Ctrl+Enter', () => {
    const executeWorkflow = vi.fn();
    useExecutionStore.setState({ executeWorkflow });

    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, key: 'Enter' }),
      );
    });

    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(true);
    expect(executeWorkflow).not.toHaveBeenCalled();
  });

  it('runs selected nodes immediately on Cmd/Ctrl+Shift+Enter', () => {
    const executeSelectedNodes = vi.fn();
    useExecutionStore.setState({ executeSelectedNodes });
    useWorkflowStore.setState({ selectedNodeIds: ['node-1'] });

    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          key: 'Enter',
          shiftKey: true,
        }),
      );
    });

    expect(executeSelectedNodes).toHaveBeenCalledTimes(1);
    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(false);
  });
});
