// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import PostSignupPage from './page';

const {
  captureAnalyticsEventMock,
  createCheckoutSessionMock,
  currentUserState,
  getTokenMock,
  getMyOrganizationsMock,
  isCloudMock,
  isEEEnabledMock,
  isSelfHostedMock,
  managedCreateCheckoutSessionMock,
  resolveAuthTokenMock,
  searchParamsState,
} = vi.hoisted(() => ({
  captureAnalyticsEventMock: vi.fn(),
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
  isCloudMock: vi.fn(),
  isEEEnabledMock: vi.fn(),
  isSelfHostedMock: vi.fn(),
  managedCreateCheckoutSessionMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
  searchParamsState: {
    value: new URLSearchParams(),
  },
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    CHECKOUT_STARTED: 'checkout_started',
    SIGNUP_COMPLETED: 'signup_completed',
  },
  captureAnalyticsEvent: captureAnalyticsEventMock,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: getTokenMock,
    isLoaded: true,
    isSignedIn: true,
    orgId: null,
    sessionId: 'session-123',
    userId: 'user-123',
  }),
}));

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      firstName: 'Local',
      fullName: 'Local User',
      id: 'user-123',
      imageUrl: null,
      lastName: 'User',
      primaryEmailAddress: { emailAddress: 'local@example.com' },
      publicMetadata: {},
      reload: vi.fn(),
      updatedAt: null,
    },
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => currentUserState,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
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

vi.mock('@genfeedai/config/license', () => ({
  isEEEnabled: () => isEEEnabledMock(),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isCloudDeployment: () => isCloudMock(),
  isSelfHostedDeployment: () => isSelfHostedMock(),
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
    captureAnalyticsEventMock.mockReset();
    managedCreateCheckoutSessionMock.mockReset();
    getTokenMock.mockReset();
    getMyOrganizationsMock.mockReset();
    isCloudMock.mockReset();
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
    isCloudMock.mockReturnValue(false);
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

  it('uses URL payg handoff to bypass stale stored paid plan checkout', async () => {
    searchParamsState.value = new URLSearchParams(
      'plan=payg&brandDomain=https://www.acme.co/path&brandName=Acme',
    );
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.selectedPlan, 'price_stale');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand?auto=true');
    });

    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan),
    ).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBe(
      'Acme',
    );
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('starts an EE plan checkout from a post-signup plan query', async () => {
    isEEEnabledMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    searchParamsState.value = new URLSearchParams('plan=price_123');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/onboarding/providers',
        quantity: null,
        stripePriceId: 'price_123',
        successUrl:
          'http://localhost/onboarding/brand?checkout=completed&checkoutKind=plan',
      });
    });
    expect(locationState.href).toBe('https://checkout.stripe.test/session');
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
        successUrl:
          'http://localhost/onboarding/brand?checkout=completed&checkoutKind=credits',
      });
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith('signup_completed', {
      handoffSource: 'post_signup',
      hasCloudHandoff: false,
      hasCreditsIntent: true,
      hasPlanIntent: false,
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith('checkout_started', {
      checkoutKind: 'credits',
      handoffSource: 'post_signup',
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
            'http://localhost/managed-credits/success?session_id={CHECKOUT_SESSION_ID}&checkout=completed&checkoutKind=managed_credits',
        },
        expect.any(AbortSignal),
      );
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith('checkout_started', {
      checkoutKind: 'managed_credits',
      handoffSource: 'post_signup',
    });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(locationState.href).toBe(
      'https://checkout.stripe.test/managed-session',
    );
  });

  it('routes new cloud signups to the org-scoped agent onboarding surface', async () => {
    isCloudMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    getMyOrganizationsMock.mockResolvedValue([
      {
        brand: null,
        id: 'org-1',
        isActive: true,
        isOwner: true,
        label: 'Acme',
        slug: 'acme',
      },
    ]);

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/acme/~/agent/onboarding');
    });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('falls back to the wizard when no cloud org slug can be resolved', async () => {
    isCloudMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    getMyOrganizationsMock.mockResolvedValue([]);

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand');
    });
  });

  it('keeps plan checkout returns on the wizard even on cloud (preserves #1421)', async () => {
    isCloudMock.mockReturnValue(true);
    isEEEnabledMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    getMyOrganizationsMock.mockResolvedValue([
      {
        brand: null,
        id: 'org-1',
        isActive: true,
        isOwner: true,
        label: 'Acme',
        slug: 'acme',
      },
    ]);
    searchParamsState.value = new URLSearchParams('plan=price_123');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/onboarding/providers',
        quantity: null,
        stripePriceId: 'price_123',
        successUrl:
          'http://localhost/onboarding/brand?checkout=completed&checkoutKind=plan',
      });
    });
    expect(locationState.href).toBe('https://checkout.stripe.test/session');
  });
});
