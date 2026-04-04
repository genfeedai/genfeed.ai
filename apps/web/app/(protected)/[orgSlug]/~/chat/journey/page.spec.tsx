import {
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  ONBOARDING_TOTAL_VISIBLE_CREDITS,
} from '@genfeedai/types';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

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
    expect(screen.getByText('Activation Journey')).toBeInTheDocument();
    expect(
      screen.getByText(
        `Start with ${ONBOARDING_SIGNUP_GIFT_CREDITS} welcome credits and unlock ${ONBOARDING_JOURNEY_TOTAL_CREDITS} more`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(String(ONBOARDING_TOTAL_VISIBLE_CREDITS)),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(`${ONBOARDING_SIGNUP_GIFT_CREDITS}`).length,
    ).toBeGreaterThan(0);

    const firstMission = ONBOARDING_JOURNEY_MISSIONS[0];
    const nextMission = ONBOARDING_JOURNEY_MISSIONS[1];

    expect(screen.getByText(firstMission.label)).toBeInTheDocument();
    expect(screen.getByText(nextMission.label)).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Recommended next')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to onboarding chat/i }),
    ).toHaveAttribute('href', '/chat/onboarding');
  });

  it('shows a loading spinner while organization settings load', () => {
    useOrganizationMock.mockReturnValueOnce({
      isLoading: true,
      refresh: refreshMock,
      settings: undefined,
    });

    const { container } = render(<ChatJourneyPage />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
