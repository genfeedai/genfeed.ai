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

import OnboardingRootPage from './page';

describe('OnboardingRootPage routing', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
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

  it('replays the full wizard from the first step for a fully-onboarded user', async () => {
    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/onboarding/summary');
  });

  it('resumes at the first incomplete step for a mid-onboarding user', async () => {
    mocks.currentUser = {
      currentUser: { onboardingStepsCompleted: ['brand'] },
      isLoading: false,
    };

    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers');
    });
  });

  it('prioritizes the proactive-lead path over the wizard replay', async () => {
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
