import { WorkflowCreatedCard } from '@cloud/agent/components/WorkflowCreatedCard';
import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('WorkflowCreatedCard', () => {
  it('renders workflow and execution handoff links', () => {
    const action: AgentUiAction = {
      ctas: [
        { href: '/workflows/wf-1', label: 'Open workflow' },
        {
          href: '/workflows/executions',
          label: 'Open executions',
        },
      ],
      description: 'Recurring image automation is ready.',
      id: 'workflow-created-1',
      nextRunAt: '2026-03-10T17:00:00.000Z',
      scheduleSummary: 'Runs 0 17 * * * (Europe/Malta)',
      title: 'Automation created',
      type: 'workflow_created_card',
      workflowId: 'wf-1',
      workflowName: 'Instagram image workflow',
    };

    render(<WorkflowCreatedCard action={action} />);

    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workflows/wf-1',
    );
    expect(
      screen.getByRole('link', { name: 'Open executions' }),
    ).toHaveAttribute('href', '/workflows/executions');
  });

  it('renders action CTAs and invokes the UI action handler', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_install_official_workflow',
          label: 'Confirm install',
          payload: { sourceId: 'template-1' },
        },
      ],
      id: 'workflow-created-2',
      title: 'Install official workflow?',
      type: 'workflow_created_card',
      workflowName: 'Social Media Video Series',
    };

    render(<WorkflowCreatedCard action={action} onUiAction={onUiAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm install' }));

    expect(onUiAction).toHaveBeenCalledWith(
      'confirm_install_official_workflow',
      { sourceId: 'template-1' },
    );
  });

  it('shows installing state while an action CTA is running', () => {
    let resolveAction: (() => void) | null = null;
    const onUiAction = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_install_official_workflow',
          label: 'Confirm install',
        },
      ],
      id: 'workflow-created-3',
      title: 'Install official workflow?',
      type: 'workflow_created_card',
      workflowName: 'Social Media Video Series',
    };

    render(<WorkflowCreatedCard action={action} onUiAction={onUiAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm install' }));

    expect(
      screen.getByRole('button', { name: 'Installing...' }),
    ).toBeDisabled();

    resolveAction?.();
  });
});
