import { AgentFullPageOnboardingChrome } from '@genfeedai/agent/components/AgentFullPageOnboardingChrome';
import type { OnboardingChecklistStep } from '@genfeedai/props/ui/agent/agent-onboarding.props';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STEPS: OnboardingChecklistStep[] = [
  {
    description: 'Tell the agent who you are.',
    id: 'brand',
    rewardCredits: 25,
    status: 'complete',
    title: 'Create your brand',
  },
  {
    description: 'Bring your own provider keys.',
    id: 'providers',
    rewardCredits: 25,
    status: 'pending',
    title: 'Connect a provider',
  },
];

function renderChrome() {
  return render(
    <AgentFullPageOnboardingChrome
      completionPercent={50}
      currentStepId="providers"
      earnedCredits={25}
      mobileChecklistOpen={false}
      onMobileChecklistOpenChange={vi.fn()}
      signupGiftCredits={50}
      steps={STEPS}
      totalJourneyCredits={100}
      totalOnboardingCreditsVisible={150}
    />,
  );
}

describe('AgentFullPageOnboardingChrome', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the managed credit economy on a cloud deployment', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    renderChrome();

    expect(screen.getByText('Signup gift')).toBeInTheDocument();
    expect(screen.getByText('25/100')).toBeInTheDocument();
    expect(screen.getByText('25/100 credits')).toBeInTheDocument();
    expect(screen.getAllByText('+25')).toHaveLength(2);
  });

  it('hides every credit affordance on a self-hosted deployment', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    renderChrome();

    expect(screen.queryByText('Signup gift')).not.toBeInTheDocument();
    expect(screen.queryByText('Journey unlocked')).not.toBeInTheDocument();
    expect(screen.queryByText('Total visible')).not.toBeInTheDocument();
    expect(screen.queryByText('25/100 credits')).not.toBeInTheDocument();
    expect(screen.queryByText('+25')).not.toBeInTheDocument();
  });

  it('replaces the mobile credit counter with step progress when self-hosted', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    renderChrome();

    expect(screen.getByText(/1\/\s*2 done/)).toBeInTheDocument();
    expect(screen.getByText('Connect a provider')).toBeInTheDocument();
  });
});
