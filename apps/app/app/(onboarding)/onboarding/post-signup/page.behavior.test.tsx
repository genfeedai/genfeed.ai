// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import PostSignupPage from './page';

const {
  captureAnalyticsEventMock,
  captureBrandOsFunnelStageMock,
  claimBrandOsPreviewMock,
  claimPublicYoutubeClipMock,
  claimReferralMock,
  createCheckoutSessionMock,
  currentUserState,
  getTokenMock,
  getMyOrganizationsMock,
  findOrganizationBrandsMock,
  hasAgentFirstOnboardingMock,
  hasOrganizationBillingMock,
  isSaaSMock,
  isSelfHostedMock,
  managedCreateCheckoutSessionMock,
  resolveAuthTokenMock,
  searchParamsState,
} = vi.hoisted(() => ({
  captureAnalyticsEventMock: vi.fn(),
  captureBrandOsFunnelStageMock: vi.fn(),
  claimBrandOsPreviewMock: vi.fn(),
  claimPublicYoutubeClipMock: vi.fn(),
  claimReferralMock: vi.fn(),
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
  findOrganizationBrandsMock: vi.fn(),
  hasAgentFirstOnboardingMock: vi.fn(),
  hasOrganizationBillingMock: vi.fn(),
  isSaaSMock: vi.fn(),
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
    PUBLIC_YOUTUBE_CLIP_PROJECT_CLAIMED: 'public_youtube_clip_project_claimed',
    SIGNUP_COMPLETED: 'signup_completed',
  },
  captureAnalyticsEvent: captureAnalyticsEventMock,
  captureBrandOsFunnelStage: captureBrandOsFunnelStageMock,
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
  usePathname: () => '/',
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

vi.mock('@services/billing/referrals.service', () => ({
  ReferralsService: {
    getInstance: vi.fn(() => ({ claim: claimReferralMock })),
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
    warn: vi.fn(),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => ({
      findOrganizationBrands: findOrganizationBrandsMock,
      getMyOrganizations: getMyOrganizationsMock,
    })),
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(() => ({
      claimBrandOsPreview: claimBrandOsPreviewMock,
    })),
  },
}));

vi.mock('@services/content/clip-projects.service', () => ({
  ClipProjectsService: {
    getInstance: vi.fn(() => ({
      claimPublicYoutubeClip: claimPublicYoutubeClipMock,
    })),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => hasOrganizationBillingMock(),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => hasAgentFirstOnboardingMock(),
  isSaaS: () => isSaaSMock(),
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
    captureBrandOsFunnelStageMock.mockReset();
    claimBrandOsPreviewMock.mockReset();
    claimPublicYoutubeClipMock.mockReset();
    claimReferralMock.mockReset();
    managedCreateCheckoutSessionMock.mockReset();
    getTokenMock.mockReset();
    getMyOrganizationsMock.mockReset();
    findOrganizationBrandsMock.mockReset();
    hasAgentFirstOnboardingMock.mockReset();
    hasOrganizationBillingMock.mockReset();
    isSaaSMock.mockReset();
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
    // Community is the default deployment under test: self-hosted web, which
    // onboards inside the agent workspace (#1835) with no managed checkout.
    hasAgentFirstOnboardingMock.mockReturnValue(true);
    hasOrganizationBillingMock.mockReturnValue(false);
    isSaaSMock.mockReturnValue(false);
    isSelfHostedMock.mockReturnValue(true);
    resolveAuthTokenMock.mockResolvedValue('api-token');
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
    findOrganizationBrandsMock.mockResolvedValue([
      { id: 'brand-1', slug: 'acme-brand' },
    ]);
    claimBrandOsPreviewMock.mockResolvedValue({
      id: 'brand-1',
      status: 'claimed',
    });
    claimPublicYoutubeClipMock.mockResolvedValue({
      projectId: 'clip-project-1',
      status: 'claimed',
    });
    claimReferralMock.mockResolvedValue({
      isAccepted: true,
      status: 'accepted',
    });
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

  it('routes Community signups into the shared brand step and clears stale plan handoff', async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.selectedPlan, 'price_123');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand?auto=true');
    });

    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan),
    ).toBeNull();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('claims an opaque Brand OS token into the active tenant and routes to review', async () => {
    const token = 'a'.repeat(43);
    searchParamsState.value = new URLSearchParams({ brandOsToken: token });

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(claimBrandOsPreviewMock).toHaveBeenCalledWith('brand-1', {
        previewToken: token,
      });
    });
    expect(findOrganizationBrandsMock).toHaveBeenCalledWith('org-1');
    expect(captureBrandOsFunnelStageMock).toHaveBeenCalledWith('draft_saved');
    expect(locationState.href).toBe('/acme/acme-brand/settings/kit');
  });

  it('retries a recoverable Brand OS storage outage without losing the token', async () => {
    const token = 'a'.repeat(43);
    searchParamsState.value = new URLSearchParams({ brandOsToken: token });
    claimBrandOsPreviewMock
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce({ id: 'brand-1', status: 'claimed' });

    render(<PostSignupPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry saving preview' }),
    );

    await waitFor(() =>
      expect(claimBrandOsPreviewMock).toHaveBeenCalledTimes(2),
    );
    expect(claimBrandOsPreviewMock).toHaveBeenLastCalledWith('brand-1', {
      previewToken: token,
    });
    expect(locationState.href).toBe('/acme/acme-brand/settings/kit');
  });

  it('claims an opaque clip-tool token and routes into the Studio project', async () => {
    const token = 'b'.repeat(43);
    searchParamsState.value = new URLSearchParams({ clipToolToken: token });

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(claimPublicYoutubeClipMock).toHaveBeenCalledWith({
        brandId: 'brand-1',
        previewToken: token,
      });
    });
    expect(locationState.href).toBe(
      '/acme/acme-brand/studio/clips/clip-project-1',
    );
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      'public_youtube_clip_project_claimed',
      { source: 'public_preview' },
    );
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

  it('claims and clears referral attribution before starting a PAYG checkout', async () => {
    hasOrganizationBillingMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    searchParamsState.value = new URLSearchParams(
      'ref=frtesttestaa&credits=1000',
    );
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.referralCode, 'frtesttestaa');

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(claimReferralMock).toHaveBeenCalledWith('frtesttestaa');
      expect(createCheckoutSessionMock).toHaveBeenCalled();
    });
    expect(claimReferralMock.mock.invocationCallOrder[0]).toBeLessThan(
      createCheckoutSessionMock.mock.invocationCallOrder[0],
    );
    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.referralCode),
    ).toBeNull();
  });

  it('continues signup when referral attribution is temporarily unavailable', async () => {
    hasOrganizationBillingMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    searchParamsState.value = new URLSearchParams(
      'ref=frtesttestaa&credits=1000',
    );
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.referralCode, 'frtesttestaa');
    claimReferralMock.mockRejectedValue(new Error('API unavailable'));

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(claimReferralMock).toHaveBeenCalledWith('frtesttestaa');
      expect(createCheckoutSessionMock).toHaveBeenCalled();
    });
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.referralCode)).toBe(
      'frtesttestaa',
    );
  });

  it('does not let a hung referral claim block PAYG checkout', async () => {
    vi.useFakeTimers();
    try {
      hasOrganizationBillingMock.mockReturnValue(true);
      isSelfHostedMock.mockReturnValue(false);
      searchParamsState.value = new URLSearchParams(
        'ref=frtesttestaa&credits=1000',
      );
      localStorage.setItem(
        ONBOARDING_STORAGE_KEYS.referralCode,
        'frtesttestaa',
      );
      claimReferralMock.mockReturnValue(new Promise(() => undefined));

      render(<PostSignupPage />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(claimReferralMock).toHaveBeenCalledWith('frtesttestaa');
      expect(createCheckoutSessionMock).toHaveBeenCalled();
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.referralCode)).toBe(
        'frtesttestaa',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts an EE plan checkout from a post-signup plan query', async () => {
    hasOrganizationBillingMock.mockReturnValue(true);
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
    hasOrganizationBillingMock.mockReturnValue(true);
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
    hasOrganizationBillingMock.mockReturnValue(false);
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

  it('routes new SaaS signups to the shared brand step', async () => {
    isSaaSMock.mockReturnValue(true);
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
      expect(locationState.href).toBe('/onboarding/brand');
    });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('still opens the shared brand step when no SaaS org slug can be resolved', async () => {
    isSaaSMock.mockReturnValue(true);
    isSelfHostedMock.mockReturnValue(false);
    getMyOrganizationsMock.mockResolvedValue([]);

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(locationState.href).toBe('/onboarding/brand');
    });
  });

  it('returns SaaS plan checkout to agent-first onboarding', async () => {
    isSaaSMock.mockReturnValue(true);
    hasOrganizationBillingMock.mockReturnValue(true);
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

  it('keeps cloud-connected desktop signups on the classic wizard', async () => {
    // Desktop is deferred to #2380, so it keeps the classic wizard even when
    // the install is cloud-connected.
    hasAgentFirstOnboardingMock.mockReturnValue(false);
    isSaaSMock.mockReturnValue(false);
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
      expect(locationState.href).toBe('/onboarding/brand');
    });
    expect(getMyOrganizationsMock).not.toHaveBeenCalled();
  });
});
