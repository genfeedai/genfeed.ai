import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUser: { isLoaded: true, user: { publicMetadata: {} } } as {
    isLoaded: boolean;
    user: { publicMetadata: Record<string, unknown> } | null;
  },
  currentUser: { isLoading: false } as {
    isLoading: boolean;
    currentUser?: { onboardingStepsCompleted: string[] };
  },
  isOnboardingPreview: false,
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mocks.currentUser,
}));

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => mocks.authUser,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get isOnboardingPreview() {
      return mocks.isOnboardingPreview;
    },
  },
}));

import OnboardingRootPage from './page';

describe('OnboardingRootPage routing', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.isOnboardingPreview = false;
    mocks.authUser = { isLoaded: true, user: { publicMetadata: {} } };
    mocks.currentUser = {
      currentUser: {
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      },
      isLoading: false,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a fully-onboarded user to summary when preview is disabled', async () => {
    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/summary');
    });
  });

  it('sends any user to the first step (brand) when preview is enabled', async () => {
    mocks.isOnboardingPreview = true;

    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/onboarding/summary');
  });

  it('prioritizes the proactive-lead path over preview mode', async () => {
    mocks.isOnboardingPreview = true;
    mocks.authUser = {
      isLoaded: true,
      user: { publicMetadata: { proactiveLeadId: 'lead_123' } },
    };

    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/proactive');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/onboarding/brand');
  });
});
