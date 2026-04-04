import { ClipWorkflowRunCard } from '@genfeedai/agent/components/ClipWorkflowRunCard';
import { WorkflowExecuteCard } from '@genfeedai/agent/components/WorkflowExecuteCard';
import { WorkflowTriggerCard } from '@genfeedai/agent/components/WorkflowTriggerCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

function createApiServiceMock(): AgentApiService {
  return {
    generateIngredient: vi.fn(),
    getWorkflowInterface: vi.fn().mockResolvedValue({
      inputs: {},
      outputs: {},
    }),
    mergeVideos: vi.fn(),
    reframeVideo: vi.fn(),
    resizeVideo: vi.fn(),
    triggerWorkflow: vi.fn().mockResolvedValue({ id: 'exec-123' }),
  } as unknown as AgentApiService;
}

describe('Workflow card route handoffs', () => {
  it('points the empty workflow trigger state to the workflow library', () => {
    const apiService = createApiServiceMock();
    const action: AgentUiAction = {
      id: 'action-1',
      title: 'Trigger a workflow',
      type: 'workflow_trigger_card',
      workflows: [],
    };

    render(<WorkflowTriggerCard action={action} apiService={apiService} />);

    expect(
      screen.getByRole('link', { name: /create a workflow/i }),
    ).toHaveAttribute('href', '/workflows');
  });

  it('points workflow execution links to the canonical executions route', async () => {
    const user = userEvent.setup();
    const apiService = createApiServiceMock();

    const triggerAction: AgentUiAction = {
      id: 'trigger-action',
      title: 'Run a workflow',
      type: 'workflow_trigger_card',
      workflows: [{ id: 'wf-1', name: 'Workflow One' }],
    };

    const { unmount: unmountTrigger } = render(
      <WorkflowTriggerCard action={triggerAction} apiService={apiService} />,
    );

    await user.click(screen.getByRole('button', { name: 'Workflow One' }));
    await user.click(screen.getByRole('button', { name: /run workflow/i }));

    expect(
      await screen.findByRole('link', { name: /view execution/i }),
    ).toHaveAttribute('href', '/workflows/executions/exec-123');

    unmountTrigger();

    const executeAction: AgentUiAction = {
      id: 'execute-action',
      title: 'Execute a workflow',
      type: 'workflow_execute_card',
      workflowId: 'wf-2',
      workflowName: 'Workflow Two',
    };

    const { unmount: unmountExecute } = render(
      <WorkflowExecuteCard action={executeAction} apiService={apiService} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Execute' }));

    expect(
      await screen.findByRole('link', { name: /view execution/i }),
    ).toHaveAttribute('href', '/workflows/executions/exec-123');

    unmountExecute();

    const clipAction: AgentUiAction = {
      clipRun: {
        autonomousMode: false,
        requireStepConfirmation: true,
      },
      id: 'clip-action',
      title: 'Clip workflow run',
      type: 'clip_workflow_run_card',
      workflowId: 'wf-3',
    };

    render(<ClipWorkflowRunCard action={clipAction} apiService={apiService} />);

    await user.click(screen.getByRole('button', { name: /run next step/i }));

    expect(
      await screen.findByRole('link', { name: /view workflow execution/i }),
    ).toHaveAttribute('href', '/workflows/executions/exec-123');
  });
});
