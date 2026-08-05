import { OnboardingChecklistCard } from '@genfeedai/agent/components/OnboardingChecklistCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeAction(): AgentUiAction {
  return {
    checklist: [
      {
        id: 'brand',
        isCompleted: true,
        label: 'Create your brand',
        rewardCredits: 25,
      },
      {
        ctaHref: '/settings/api-keys',
        ctaLabel: 'Add keys',
        id: 'providers',
        isCompleted: false,
        label: 'Connect a provider',
        rewardCredits: 25,
      },
    ],
    id: 'onboarding-checklist-1',
    signupGiftCredits: 50,
    title: 'Getting Started',
    totalJourneyCredits: 100,
    type: 'onboarding_checklist_card',
  } as AgentUiAction;
}

describe('OnboardingChecklistCard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the credit summary and per-step rewards on a cloud deployment', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    render(<OnboardingChecklistCard action={makeAction()} />);

    expect(screen.getByText('Signup gift')).toBeInTheDocument();
    expect(screen.getByText('0/100')).toBeInTheDocument();
    expect(screen.getAllByText('+25')).toHaveLength(2);
  });

  it('hides the credit summary and rewards on a self-hosted deployment', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    render(<OnboardingChecklistCard action={makeAction()} />);

    expect(screen.queryByText('Signup gift')).not.toBeInTheDocument();
    expect(screen.queryByText('Journey unlocked')).not.toBeInTheDocument();
    expect(screen.queryByText('Total visible')).not.toBeInTheDocument();
    expect(screen.queryByText('+25')).not.toBeInTheDocument();
  });

  it('keeps progress and step CTAs visible when credits are hidden', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    render(<OnboardingChecklistCard action={makeAction()} />);

    expect(screen.getByText('1 of 2 completed')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Add keys')).toBeInTheDocument();
  });
});
