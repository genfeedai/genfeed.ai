// @vitest-environment jsdom

import type { WorkflowFile } from '@genfeedai/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunWorkflowConfirmationModal } from '@/components/RunWorkflowConfirmationModal';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { CommandPalette } from './CommandPalette';

const mockOpenModal = vi.fn();
const mockToggleAIGenerator = vi.fn();
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
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useUIStore: () => ({
    openModal: mockOpenModal,
    toggleAIGenerator: mockToggleAIGenerator,
  }),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
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
      </>
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
      </>
    );

    fireEvent.click(screen.getByText('Run Selected Nodes'));

    expect(executeSelectedNodes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Run entire workflow?')).not.toBeInTheDocument();
  });
});
