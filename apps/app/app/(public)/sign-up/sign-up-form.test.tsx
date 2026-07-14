// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SignUpBetterAuth from './sign-up-better-auth';
import SignUpForm from './sign-up-form';

const authClientMocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  magicLink: vi.fn(),
  social: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  signIn: {
    magicLink: authClientMocks.magicLink,
    social: authClientMocks.social,
  },
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    SIGNUP_STARTED: 'signup_started',
  },
  captureAnalyticsEvent: authClientMocks.captureAnalyticsEvent,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({
    children,
    logoSize,
  }: {
    children: React.ReactNode;
    logoSize?: string;
  }) => (
    <div data-logo-size={logoSize} data-testid="auth-form-layout">
      {children}
    </div>
  ),
}));

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });
const absoluteCallback = (path: string) => `${window.location.origin}${path}`;

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

describe('SignUpForm', () => {
  beforeEach(() => {
    authClientMocks.magicLink.mockReset();
    authClientMocks.magicLink.mockResolvedValue({});
    authClientMocks.social.mockReset();
    authClientMocks.social.mockResolvedValue({});
    authClientMocks.captureAnalyticsEvent.mockReset();
    localStorageMock.clear();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    window.history.replaceState({}, '', '/sign-up');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/sign-up');
  });

  it('renders the Better Auth sign-up chooser like the login chooser', () => {
    render(<SignUpForm />);

    expect(screen.getByTestId('auth-form-layout')).toHaveAttribute(
      'data-logo-size',
      'compact',
    );
    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/sign-up/magic-link',
    );
    expect(screen.queryByRole('textbox', { name: /^Email/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Continue with GitHub' }),
    ).toBeNull();
  });

  it('preserves sign-up handoff params when linking to the magic-link screen', () => {
    window.history.replaceState(
      {},
      '',
      '/sign-up?plan=pro&callbackUrl=%2Fonboarding',
    );

    render(<SignUpForm />);

    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/sign-up/magic-link?plan=pro&callbackUrl=%2Fonboarding',
    );
  });

  it('focuses the email input on the magic-link screen', () => {
    render(<SignUpBetterAuth mode="magic-link" />);

    expect(getEmailInput()).toHaveFocus();
  });

  it('sends a sign-up magic link with signup metadata and the callback URL', async () => {
    window.history.replaceState({}, '', '/sign-up?callbackUrl=%2Fonboarding');

    render(<SignUpBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: ' New@Example.com ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-up link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding'),
        email: 'new@example.com',
        metadata: { intent: 'signup' },
      });
    });
    expect(authClientMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'signup_started',
      {
        hasCloudHandoff: false,
        hasCreditsIntent: false,
        hasPlanIntent: false,
        method: 'magic_link',
      },
    );
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('defaults sign-up magic links to post-signup with handoff params', async () => {
    window.history.replaceState(
      {},
      '',
      '/sign-up?plan=payg&brandDomain=https://www.acme.co&brandName=Acme',
    );

    render(<SignUpBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Email me a sign-up link' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback(
          '/onboarding/post-signup?plan=payg&brandDomain=acme.co&brandName=Acme',
        ),
        email: 'new@example.com',
        metadata: { intent: 'signup' },
      });
    });
  });

  it('persists cloud handoff query params into onboarding localStorage keys', async () => {
    window.history.replaceState(
      {},
      '',
      '/sign-up?plan=price_123&credits=500&brandDomain=acme.co&brandName=Acme&accessMode=cloud&source=oss-onboarding',
    );

    render(<SignUpForm />);

    await waitFor(() => {
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan)).toBe(
        'price_123',
      );
    });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedCredits)).toBe(
      '500',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBe(
      'Acme',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.accessMode)).toBe(
      'cloud',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.source)).toBe(
      'oss-onboarding',
    );
  });

  it('starts Google sign-up with the callback URL', async () => {
    window.history.replaceState({}, '', '/sign-up?plan=payg');

    render(<SignUpForm />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    );

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding/post-signup?plan=payg'),
        provider: 'google',
      });
    });
    expect(authClientMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'signup_started',
      {
        hasCloudHandoff: false,
        hasCreditsIntent: false,
        hasPlanIntent: true,
        method: 'google',
      },
    );
  });

  it('does not persist invalid access mode or malformed credit handoff params', async () => {
    window.history.replaceState(
      {},
      '',
      '/sign-up?credits=500abc&brandDomain=https://www.acme.co/path&accessMode=admin',
    );

    render(<SignUpForm />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Create your account' }),
      ).toBeInTheDocument();
    });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedCredits)).toBe(
      null,
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.accessMode)).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
  });
});
