import { WorkflowCreatedCard } from '@genfeedai/agent/components/WorkflowCreatedCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('WorkflowCreatedCard', () => {
  it('renders workflow and execution handoff links', () => {
    const action: AgentUiAction = {
      ctas: [
        { href: '/automation/workflows/wf-1', label: 'Open workflow' },
        {
          href: '/automation/runs',
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
      '/automation/workflows/wf-1',
    );
    expect(
      screen.getByRole('link', { name: 'Open executions' }),
    ).toHaveAttribute('href', '/automation/runs');
  });
});
