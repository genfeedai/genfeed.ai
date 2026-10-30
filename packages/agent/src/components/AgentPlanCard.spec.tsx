import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AgentPlanCard } from './AgentPlanCard';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/agent/components/SafeMarkdown', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const plan: AgentProposedPlan = {
  content: '1. Draft the tweets',
  createdAt: '2026-10-28T07:00:00.000Z',
  id: 'plan-1',
  status: 'awaiting_approval',
  updatedAt: '2026-10-28T07:00:00.000Z',
};

function buildDecision(isBusy = false) {
  return {
    isBusy,
    onApprove: vi.fn(),
    onRequestChanges: vi.fn(),
  };
}

describe('AgentPlanCard decision', () => {
  it('approves from inside the card', () => {
    const decision = buildDecision();
    render(<AgentPlanCard decision={decision} plan={plan} />);

    const card = screen.getByTestId('agent-plan-card');
    expect(card).toContainElement(screen.getByTestId('agent-plan-decision'));
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));
    expect(decision.onApprove).toHaveBeenCalledTimes(1);
  });

  it('sends the typed note as the requested change and closes the field', async () => {
    const decision = buildDecision();
    render(<AgentPlanCard decision={decision} plan={plan} />);

    fireEvent.click(screen.getByRole('button', { name: 'requestChanges' }));
    expect(screen.getByRole('button', { name: 'sendChanges' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('revisePlaceholder'), {
      target: { value: '  Make it shorter  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sendChanges' }));

    expect(decision.onRequestChanges).toHaveBeenCalledWith('Make it shorter');
    await waitFor(() =>
      expect(screen.queryByLabelText('revisePlaceholder')).toBeNull(),
    );
  });

  it('keeps the note when the request was not accepted', async () => {
    const decision = buildDecision();
    decision.onRequestChanges.mockResolvedValue(false);
    render(<AgentPlanCard decision={decision} plan={plan} />);

    fireEvent.click(screen.getByRole('button', { name: 'requestChanges' }));
    fireEvent.change(screen.getByLabelText('revisePlaceholder'), {
      target: { value: 'Make it shorter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sendChanges' }));

    await waitFor(() =>
      expect(decision.onRequestChanges).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByLabelText('revisePlaceholder')).toHaveValue(
      'Make it shorter',
    );
  });

  it('drops the note on cancel', () => {
    render(<AgentPlanCard decision={buildDecision()} plan={plan} />);

    fireEvent.click(screen.getByRole('button', { name: 'requestChanges' }));
    fireEvent.change(screen.getByLabelText('revisePlaceholder'), {
      target: { value: 'Shorter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'requestChanges' }));

    expect(screen.getByLabelText('revisePlaceholder')).toHaveValue('');
  });

  it('locks both actions while a decision is being sent', () => {
    render(<AgentPlanCard decision={buildDecision(true)} plan={plan} />);

    expect(screen.getByRole('button', { name: 'approve' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'requestChanges' }),
    ).toBeDisabled();
  });

  it('offers no decision once the plan is approved or has nothing in it', () => {
    const { rerender } = render(
      <AgentPlanCard
        decision={buildDecision()}
        plan={{ ...plan, status: 'approved' }}
      />,
    );
    expect(screen.queryByTestId('agent-plan-decision')).toBeNull();

    rerender(
      <AgentPlanCard
        decision={buildDecision()}
        plan={{ ...plan, content: '' }}
      />,
    );
    expect(screen.queryByTestId('agent-plan-decision')).toBeNull();
  });
});
