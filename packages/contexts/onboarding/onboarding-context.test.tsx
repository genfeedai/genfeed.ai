// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.fn();
const getBetterAuthTokenMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
const refetchUserMock = vi.fn();
const getInstanceMock = vi.fn();
const updateOnboardingMock = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({
  getBetterAuthToken: (...args: unknown[]) => getBetterAuthTokenMock(...args),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: getTokenMock,
    isLoaded: true,
    isSignedIn: true,
    orgId: null,
    sessionId: null,
    userId: 'mongo_user_123',
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'mongo_user_123',
      onboardingStepsCompleted: [],
    },
    isLoading: false,
    refetchUser: refetchUserMock,
  }),
}));

const hasAgentFirstOnboardingMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => hasAgentFirstOnboardingMock(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/onboarding/user-onboarding.service', () => ({
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
} from '@genfeedai/contexts/onboarding/onboarding-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';

function StepCompleteControl() {
  const { handleStepComplete } = useOnboarding();

  return (
    <Button
      label="Complete step"
      onClick={() => handleStepComplete('brand')}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    />
  );
}

describe('OnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAgentFirstOnboardingMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue('session-token');
    refetchUserMock.mockResolvedValue(undefined);
    updateOnboardingMock.mockResolvedValue(undefined);
    getInstanceMock.mockReturnValue({
      updateOnboarding: updateOnboardingMock,
    });
  });

  it('refreshes user state after onboarding updates on the standard session token path', async () => {
    render(
      <OnboardingProvider>
        <StepCompleteControl />
      </OnboardingProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Complete step',
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(getTokenMock).toHaveBeenCalledWith(undefined);
      expect(getInstanceMock).toHaveBeenCalledWith('session-token');
      expect(updateOnboardingMock).toHaveBeenCalledWith('mongo_user_123', {
        onboardingStepsCompleted: ['brand'],
      });
      expect(refetchUserMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith('/agent/onboarding');
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it('keeps Desktop on the shared providers step after brand', async () => {
    hasAgentFirstOnboardingMock.mockReturnValue(false);

    render(
      <OnboardingProvider>
        <StepCompleteControl />
      </OnboardingProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Complete step',
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/onboarding/providers');
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
