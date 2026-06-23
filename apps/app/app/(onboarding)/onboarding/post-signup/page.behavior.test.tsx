// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import PostSignupPage from './page';

const {
  createCheckoutSessionMock,
  currentUserState,
  getTokenMock,
  getMyOrganizationsMock,
  isEEEnabledMock,
  isSelfHostedMock,
  managedCreateCheckoutSessionMock,
  resolveAuthTokenMock,
  searchParamsState,
} = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
  currentUserState: {
    currentUser: {
      email: 'local@example.com',
      firstName: 'Local',
      id: 'user-123',
      lastName: 'User',
      onboardingStepsCompleted: [] as string[],
    },
    isLoading: false,
  },
  getTokenMock: vi.fn(),
  getMyOrganizationsMock: vi.fn(),
  isEEEnabledMock: vi.fn(),
  isSelfHostedMock: vi.fn(),
  managedCreateCheckoutSessionMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
  searchParamsState: {
    value: new URLSearchParams(),
  },
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
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

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
}));

vi.mock('@services/billing/stripe.service', () => ({
  StripeService: {
    getInstance: vi.fn(() => ({
      createCheckoutSession: createCheckoutSessionMock,
    })),
  },
}));

vi.mock('@services/billing/managed-credits.service', () => ({
  ManagedCreditsService: {
    createCheckoutSession: managedCreateCheckoutSessionMock,
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
    managedCreateCheckoutSessionMock.mockReset();
    getTokenMock.mockReset();
    getMyOrganizationsMock.mockReset();
    isEEEnabledMock.mockReset();
    isSelfHostedMock.mockReset();
    resolveAuthTokenMock.mockReset();
    localStorageMock.clear();

    currentUserState.currentUser = {
      email: 'local@example.com',
      firstName: 'Local',
      id: 'user-123',
      lastName: 'User',
      onboardingStepsCompleted: [],
    };
    currentUserState.isLoading = false;
    isEEEnabledMock.mockReturnValue(false);
    isSelfHostedMock.mockReturnValue(true);
    resolveAuthTokenMock.mockResolvedValue('api-token');
    getMyOrganizationsMock.mockResolvedValue([]);
    createCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    managedCreateCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/managed-session',
    });
    searchParamsState.value = new URLSearchParams();

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

  it('starts an EE credits checkout from a desktop post-signup credits query', async () => {
    isEEEnabledMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    searchParamsState.value = new URLSearchParams(
      'credits=1000&source=desktop',
    );
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.selectedPlan, 'price_stale');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/onboarding/providers',
        quantity: 1000,
        stripePriceId: 'price_payg',
        successUrl: 'http://localhost/onboarding/brand',
      });
    });
    expect(locationState.href).toBe('https://checkout.stripe.test/session');
    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedCredits),
    ).toBeNull();
    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan),
    ).toBeNull();
  });

  it('starts a managed cloud credits checkout for self-hosted credit handoff', async () => {
    isEEEnabledMock.mockReturnValue(false);
    isSelfHostedMock.mockReturnValue(true);
    searchParamsState.value = new URLSearchParams('credits=1000');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(managedCreateCheckoutSessionMock).toHaveBeenCalledWith(
        {
          cancelUrl: 'http://localhost/onboarding/providers',
          email: 'local@example.com',
          firstName: 'Local',
          lastName: 'User',
          quantity: 1000,
          successUrl:
            'http://localhost/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
        },
        expect.any(AbortSignal),
      );
    });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(locationState.href).toBe(
      'https://checkout.stripe.test/managed-session',
    );
  });
});
