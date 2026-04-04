// @vitest-environment jsdom

import type { WorkflowFile } from '@genfeedai/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const mockPush = vi.fn();
const mockOpenModal = vi.fn();
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
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useUIStore: () => ({
    openModal: mockOpenModal,
  }),
}));

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
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
      window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'Enter' }));
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
        new KeyboardEvent('keydown', { ctrlKey: true, key: 'Enter', shiftKey: true })
      );
    });

    expect(executeSelectedNodes).toHaveBeenCalledTimes(1);
    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(false);
  });
});
