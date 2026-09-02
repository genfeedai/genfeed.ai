import {
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
} from '@genfeedai/contracts/types';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const refreshMock = vi.fn();
const useOrganizationMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => useOrganizationMock(),
}));

import ChatJourneyPage from './page';

function buildJourneyMissionState() {
  return ONBOARDING_JOURNEY_MISSIONS.map((mission, index) => ({
    completedAt: index === 0 ? '2026-03-30T10:00:00.000Z' : null,
    id: mission.id,
    isCompleted: index === 0,
    rewardClaimed: index === 0,
    rewardCredits: mission.rewardCredits,
  }));
}

describe('ChatJourneyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrganizationMock.mockReturnValue({
      isLoading: false,
      refresh: refreshMock,
      settings: {
        onboardingJourneyMissions: buildJourneyMissionState(),
      },
    });
  });

  it('renders the activation journey progress and mission cards', () => {
    render(<ChatJourneyPage />);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Activation Journey' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText(
        'Complete guided missions and unlock more credits as you go',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Available to unlock')).toBeInTheDocument();
    expect(screen.getByText('Journey unlocked')).toBeInTheDocument();
    expect(screen.getByText('Journey total')).toBeInTheDocument();
    expect(
      screen.getAllByText(String(ONBOARDING_JOURNEY_TOTAL_CREDITS)).length,
    ).toBeGreaterThan(0);

    const firstMission = ONBOARDING_JOURNEY_MISSIONS[0];
    const nextMission = ONBOARDING_JOURNEY_MISSIONS[1];

    expect(screen.getByText(firstMission.label)).toBeInTheDocument();
    expect(screen.getByText(nextMission.label)).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Recommended next')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to onboarding/i }),
    ).toHaveAttribute('href', '/onboarding/providers');
  });

  it('renders chrome and placeholder stats while organization settings load', () => {
    useOrganizationMock.mockReturnValueOnce({
      isLoading: true,
      refresh: refreshMock,
      settings: undefined,
    });

    render(<ChatJourneyPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Activation Journey' }),
    ).toHaveClass('sr-only');
    expect(
      screen.getByRole('link', { name: /back to onboarding/i }),
    ).toHaveAttribute('href', '/onboarding/providers');
    expect(screen.getByText('Available to unlock')).toBeInTheDocument();
    expect(screen.getByText('Journey unlocked')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.getByTestId('journey-missions-loading')).toBeInTheDocument();
    expect(
      screen.queryByText(ONBOARDING_JOURNEY_MISSIONS[0].label),
    ).not.toBeInTheDocument();
  });
});
