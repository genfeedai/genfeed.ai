// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import PostSignupPage from './page';

const {
  createCheckoutSessionMock,
  currentUserState,
  getMyOrganizationsMock,
  isEEEnabledMock,
  isSelfHostedMock,
  resolveClerkTokenMock,
} = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
  currentUserState: {
    currentUser: {
      id: 'user-123',
      onboardingStepsCompleted: [] as string[],
    },
    isLoading: false,
  },
  getMyOrganizationsMock: vi.fn(),
  isEEEnabledMock: vi.fn(),
  isSelfHostedMock: vi.fn(),
  resolveClerkTokenMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
  }),
  useUser: () => ({
    user: {
      publicMetadata: {},
    },
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => currentUserState,
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
}));

vi.mock('@services/billing/stripe.service', () => ({
  StripeService: {
    getInstance: vi.fn(() => ({
      createCheckoutSession: createCheckoutSessionMock,
    })),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    plans: {
      payg: 'price_payg',
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => ({
      getMyOrganizations: getMyOrganizationsMock,
    })),
  },
}));

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: ({
    children,
    message,
  }: {
    children?: ReactNode;
    message: string;
  }) => (
    <div>
      <p>{message}</p>
      {children}
    </div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/lib/config/edition', () => ({
  isEEEnabled: () => isEEEnabledMock(),
  isSelfHosted: () => isSelfHostedMock(),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

describe('PostSignupPage behavior', () => {
  let locationState: { href: string; origin: string };

  beforeEach(() => {
    createCheckoutSessionMock.mockReset();
    getMyOrganizationsMock.mockReset();
    isEEEnabledMock.mockReset();
    isSelfHostedMock.mockReset();
    resolveClerkTokenMock.mockReset();
    localStorageMock.clear();

    currentUserState.currentUser = {
      id: 'user-123',
      onboardingStepsCompleted: [],
    };
    currentUserState.isLoading = false;
    isEEEnabledMock.mockReturnValue(false);
    isSelfHostedMock.mockReturnValue(true);
    resolveClerkTokenMock.mockResolvedValue('api-token');
    getMyOrganizationsMock.mockResolvedValue([]);
    createCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    locationState = {
      href: 'http://localhost/onboarding/post-signup',
      origin: 'http://localhost',
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationState,
    });
  });

  it('routes OSS signups back into auto-brand onboarding and clears stale plan handoff', async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.selectedPlan, 'price_123');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');

    render(<PostSignupPage />);

    expect(screen.getByText('Setting up your workspace...')).toBeVisible();

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand?auto=true');
    });

    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan),
    ).toBeNull();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('drops malformed credit handoff values and continues normal onboarding routing', async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.selectedCredits, '500abc');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand');
    });

    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedCredits),
    ).toBeNull();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
