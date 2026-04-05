// @vitest-environment jsdom

import type { PromptNodeData } from '@genfeedai/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunWorkflowConfirmationModal } from '@/components/RunWorkflowConfirmationModal';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { BottomBar } from './BottomBar';

describe('BottomBar', () => {
  beforeEach(() => {
    useRunWorkflowConfirmationStore.getState().reset();

    useExecutionStore.setState({
      executeSelectedNodes: vi.fn(),
      executeWorkflow: vi.fn(),
      isRunning: false,
      lastFailedNodeId: null,
      stopExecution: vi.fn(),
    });

    useWorkflowStore.setState({
      nodes: [
        {
          data: {
            label: 'Prompt',
            prompt: '',
            status: 'idle',
            variables: {},
          } satisfies PromptNodeData,
          id: 'node-1',
          position: { x: 0, y: 0 },
          type: 'prompt',
        },
      ],
      selectedNodeIds: [],
      validateWorkflow: vi.fn(() => ({ errors: [], isValid: true, warnings: [] })),
    });
  });

  it('opens a confirmation modal before running the full workflow', async () => {
    const executeWorkflow = vi.fn();
    useExecutionStore.setState({ executeWorkflow });

    render(
      <>
        <BottomBar />
        <RunWorkflowConfirmationModal />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));

    expect(screen.getByText('Run entire workflow?')).toBeInTheDocument();
    expect(executeWorkflow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Run workflow' }));

    await waitFor(() => {
      expect(executeWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels full workflow execution when the modal is dismissed', () => {
    const executeWorkflow = vi.fn();
    useExecutionStore.setState({ executeWorkflow });

    render(
      <>
        <BottomBar />
        <RunWorkflowConfirmationModal />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Run entire workflow?')).not.toBeInTheDocument();
    expect(executeWorkflow).not.toHaveBeenCalled();
  });

  it('runs selected nodes immediately without opening the confirmation modal', () => {
    const executeSelectedNodes = vi.fn();
    useExecutionStore.setState({ executeSelectedNodes });
    useWorkflowStore.setState({ selectedNodeIds: ['node-1'] });

    render(
      <>
        <BottomBar />
        <RunWorkflowConfirmationModal />
      </>
    );

    fireEvent.click(screen.getAllByRole('button')[3]);
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected (1)' }));

    expect(executeSelectedNodes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Run entire workflow?')).not.toBeInTheDocument();
  });

  it('shows a single confirmation before starting a batch run', async () => {
    const executeWorkflow = vi.fn();
    useExecutionStore.setState({ executeWorkflow });

    render(
      <>
        <BottomBar />
        <RunWorkflowConfirmationModal />
      </>
    );

    fireEvent.click(screen.getAllByRole('button')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));

    expect(screen.getByText('Run entire workflow?')).toBeInTheDocument();
    expect(executeWorkflow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Run workflow' }));

    await waitFor(() => {
      expect(executeWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Run entire workflow?')).not.toBeInTheDocument();
  });
});
