import { AgentUiActionCard } from '@genfeedai/agent/components/AgentUiActionCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'action-1',
    title: 'Connect Instagram',
    type: 'oauth_connect_card',
    ...overrides,
  } as AgentUiAction;
}

describe('AgentUiActionCard', () => {
  it('renders just the title when nothing else is supplied', () => {
    render(<AgentUiActionCard action={makeAction()} />);

    expect(screen.getByText('Connect Instagram')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(
      <AgentUiActionCard
        action={makeAction({ description: 'Authorize the account' })}
      />,
    );

    expect(screen.getByText('Authorize the account')).toBeInTheDocument();
  });

  it('hides the risk badge for low risk', () => {
    render(<AgentUiActionCard action={makeAction({ riskLevel: 'low' })} />);

    expect(screen.queryByText('low')).not.toBeInTheDocument();
  });

  it('shows a semantic warning badge for medium risk', () => {
    render(<AgentUiActionCard action={makeAction({ riskLevel: 'medium' })} />);

    expect(screen.getByText('medium')).toHaveClass(
      'bg-warning/10',
      'text-warning',
    );
  });

  it('shows a semantic destructive badge for high risk', () => {
    render(<AgentUiActionCard action={makeAction({ riskLevel: 'high' })} />);

    expect(screen.getByText('high')).toHaveClass(
      'bg-destructive/10',
      'text-destructive',
    );
  });

  it('renders href ctas as links and actionable ctas as disabled buttons', () => {
    render(
      <AgentUiActionCard
        action={makeAction({
          ctas: [
            { href: 'https://example.com/connect', label: 'Open' },
            { action: 'retry', label: 'Retry' },
          ],
        })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://example.com/connect',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  });

  it('renders no cta row for an empty cta list', () => {
    render(<AgentUiActionCard action={makeAction({ ctas: [] })} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
