// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
const refetchUserMock = vi.fn();
const getInstanceMock = vi.fn();
const updateOnboardingMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'mongo_user_123',
      onboardingStepsCompleted: [],
    },
    isLoading: false,
    refetchUser: refetchUserMock,
  }),
}));

vi.mock('@genfeedai/constants', () => ({
  ONBOARDING_STEP_LABELS: {
    brand: 'Brand',
    plan: 'Plan',
  },
  ONBOARDING_STEPS: ['brand', 'plan'],
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/onboarding/user-onboarding.service', () => ({
  UserOnboardingService: {
    getInstance: (...args: unknown[]) => getInstanceMock(...args),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/brand',
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

import OnboardingProvider, {
  useOnboarding,
} from '@contexts/onboarding/onboarding-context';

describe('OnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue('session-token');
    refetchUserMock.mockResolvedValue(undefined);
    updateOnboardingMock.mockResolvedValue(undefined);
    getInstanceMock.mockReturnValue({
      updateOnboarding: updateOnboardingMock,
    });
  });

  it('refreshes user state after onboarding updates on the standard session token path', async () => {
    function Consumer() {
      const { handleStepComplete } = useOnboarding();

      return (
        <button onClick={() => handleStepComplete('brand')}>
          Complete step
        </button>
      );
    }

    render(
      <OnboardingProvider>
        <Consumer />
      </OnboardingProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Complete step',
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(getTokenMock).toHaveBeenCalledWith();
      expect(getInstanceMock).toHaveBeenCalledWith('session-token');
      expect(updateOnboardingMock).toHaveBeenCalledWith('mongo_user_123', {
        onboardingStepsCompleted: ['brand'],
      });
      expect(refetchUserMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith('/onboarding/plan');
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
