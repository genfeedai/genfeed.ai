// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import { readGoogleSignInAvailableFromEnv } from '@/lib/runtime-config/google-sign-in-availability';
import { createRuntimeAuthConfigSource } from '@/lib/runtime-config/runtime-config-source';
import SignUpBetterAuth from './sign-up-better-auth';
import SignUpForm from './sign-up-form';

const authClientMocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  isMagicLinkAvailable: vi.fn(),
  magicLink: vi.fn(),
  signUpEmail: vi.fn(),
  social: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/auth-client')>()),
  isMagicLinkAvailable: authClientMocks.isMagicLinkAvailable,
  signIn: {
    magicLink: authClientMocks.magicLink,
    social: authClientMocks.social,
  },
  signUp: { email: authClientMocks.signUpEmail },
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    SIGNUP_STARTED: 'signup_started',
  },
  captureAnalyticsEvent: authClientMocks.captureAnalyticsEvent,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/components/layouts/auth/AuthFormLayout', () => ({
  default: ({
    children,
    description,
    logoSize,
    title,
  }: {
    children: React.ReactNode;
    description?: React.ReactNode;
    logoSize?: string;
    title?: string;
  }) => (
    <div data-logo-size={logoSize} data-testid="auth-form-layout">
      {title ? (
        <>
          <h1>{title}</h1>
          <p>{description}</p>
        </>
      ) : null}
      {children}
    </div>
  ),
}));

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });
const absoluteCallback = (path: string) => {
  if (path === '/') {
    return `${window.location.origin}/`;
  }

  return `${window.location.origin}/?callbackUrl=${encodeURIComponent(path)}`;
};

// Magic links pre-encode the continuation once more: Better Auth decodes the
// verify callback twice (see buildMagicLinkCallbackURL).
const absoluteMagicLinkCallback = (path: string) =>
  path === '/'
    ? absoluteCallback('/')
    : `${window.location.origin}/?callbackUrl=${encodeURIComponent(encodeURIComponent(path))}`;

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
    vi.stubGlobal('__GENFEED_RUNTIME_CONFIG__', {
      isGoogleSignInAvailable: true,
    });
    authClientMocks.magicLink.mockReset();
    authClientMocks.magicLink.mockResolvedValue({});
    authClientMocks.social.mockReset();
    authClientMocks.social.mockResolvedValue({});
    authClientMocks.isMagicLinkAvailable.mockReset();
    authClientMocks.isMagicLinkAvailable.mockReturnValue(true);
    authClientMocks.signUpEmail.mockReset();
    authClientMocks.signUpEmail.mockResolvedValue({
      data: { token: 'session-token' },
    });
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
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/sign-up/magic-link',
    );
    expect(
      screen.getByRole('link', { name: 'Email & password' }),
    ).toHaveAttribute('href', '/sign-up/password');
    expect(screen.queryByRole('textbox', { name: /^Email/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Continue with GitHub' }),
    ).toBeNull();
  });

  it('hides Magic Link when the deployment has no email provider', () => {
    authClientMocks.isMagicLinkAvailable.mockReturnValue(false);

    render(<SignUpForm />);

    expect(screen.queryByRole('link', { name: 'Magic Link' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Email & password' }),
    ).toBeInTheDocument();
  });

  it.each([
    { clientId: undefined, clientSecret: undefined, available: false },
    { clientId: 'test-client-id', clientSecret: undefined, available: false },
    {
      clientId: undefined,
      clientSecret: 'test-client-secret',
      available: false,
    },
    { clientId: ' ', clientSecret: 'test-client-secret', available: false },
    { clientId: 'test-client-id', clientSecret: ' ', available: false },
    {
      clientId: ' test-client-id ',
      clientSecret: ' test-client-secret ',
      available: true,
    },
  ])(
    'offers Google only with the runtime credential pair: $available',
    ({ clientId, clientSecret, available }) => {
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', clientId);
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret);
      const source = createRuntimeAuthConfigSource(
        true,
        true,
        readGoogleSignInAvailableFromEnv(),
      );
      new Function('globalThis', source)(globalThis);

      render(<SignUpForm />);

      expect(Boolean(screen.queryByRole('button', { name: 'Google' }))).toBe(
        available,
      );
      expect(
        screen.getByRole('link', { name: 'Email & password' }),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: 'Magic Link' })).toBeVisible();
      expect(authClientMocks.social).not.toHaveBeenCalled();
    },
  );

  it('keeps Google hidden when no runtime capability was reported', () => {
    vi.stubGlobal('__GENFEED_RUNTIME_CONFIG__', undefined);
    render(<SignUpForm />);
    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull();
  });

  it('offers configured Google independently of Magic Link availability', () => {
    authClientMocks.isMagicLinkAvailable.mockReturnValue(false);
    render(<SignUpForm />);
    expect(screen.getByRole('button', { name: 'Google' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Magic Link' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Email & password' }),
    ).toBeVisible();
  });

  it('hides Google when the deployment has no Google OAuth credentials', () => {
    vi.stubGlobal('__GENFEED_RUNTIME_CONFIG__', {
      isGoogleSignInAvailable: false,
    });

    render(<SignUpForm />);

    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Email & password' }),
    ).toBeInTheDocument();
  });

  it('says the magic link cannot be sent and points at email sign-up', () => {
    authClientMocks.isMagicLinkAvailable.mockReturnValue(false);

    render(<SignUpBetterAuth mode="magic-link" />);

    expect(
      screen.getByRole('heading', { name: 'Magic link unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send link' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Sign up with email' }),
    ).toHaveAttribute('href', '/sign-up/password');
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
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteMagicLinkCallback('/onboarding'),
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
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteMagicLinkCallback(
          '/onboarding/post-signup?plan=payg&brandDomain=acme.co&brandName=Acme',
        ),
        email: 'new@example.com',
        metadata: { intent: 'signup' },
      });
    });
  });

  it('preserves an opaque Brand OS token in the post-signup callback only', async () => {
    const token = 'a'.repeat(43);
    window.history.replaceState(
      {},
      '',
      `/sign-up/magic-link?brandOsToken=${token}`,
    );
    render(<SignUpBetterAuth mode="magic-link" />);
    fireEvent.change(getEmailInput(), {
      target: { value: 'brand@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteMagicLinkCallback(
          `/onboarding/post-signup?brandOsToken=${token}`,
        ),
        email: 'brand@example.com',
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

  it('starts Google sign-up with the callback URL, and does not count the free payg handoff as plan intent', async () => {
    window.history.replaceState({}, '', '/sign-up?plan=payg');

    render(<SignUpForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding/post-signup?plan=payg'),
        provider: 'google',
      });
    });
    // genfeedai/genfeed.ai#4969: `?plan=payg` is the free pay-as-you-go
    // handoff, not a paid plan — it must never count as plan intent, or the
    // signup->checkout funnel alert skews toward a near-zero conversion rate.
    expect(authClientMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'signup_started',
      {
        hasCloudHandoff: false,
        hasCreditsIntent: false,
        hasPlanIntent: false,
        method: 'google',
      },
    );
  });

  it('counts a real paid plan handoff as plan intent (genfeedai/genfeed.ai#4969)', async () => {
    window.history.replaceState({}, '', '/sign-up?plan=hosted');

    render(<SignUpForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding/post-signup?plan=hosted'),
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

  it('does not count the free plan handoff as plan intent (genfeedai/genfeed.ai#5311)', async () => {
    window.history.replaceState({}, '', '/sign-up?plan=free');

    render(<SignUpForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding/post-signup?plan=free'),
        provider: 'google',
      });
    });
    // genfeedai/genfeed.ai#5311: SIGNUP_STARTED and SIGNUP_COMPLETED must
    // classify `?plan=free` identically — both are the free handoff, not
    // paid-plan intent.
    expect(authClientMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'signup_started',
      {
        hasCloudHandoff: false,
        hasCreditsIntent: false,
        hasPlanIntent: false,
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
  describe('email and password sign-up', () => {
    const fillAndSubmit = () => {
      fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
        target: { value: ' Ada Lovelace ' },
      });
      fireEvent.change(getEmailInput(), {
        target: { value: ' Ada@Example.com ' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/), {
        target: { value: 'correct-horse-battery' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    };

    it('creates the account with the post-signup callback and no email delivery', async () => {
      const assign = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, assign },
      });

      render(<SignUpBetterAuth mode="password" />);
      fillAndSubmit();

      await waitFor(() => {
        expect(authClientMocks.signUpEmail).toHaveBeenCalledWith({
          callbackURL: absoluteCallback('/onboarding/post-signup'),
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          password: 'correct-horse-battery',
        });
      });
      expect(authClientMocks.magicLink).not.toHaveBeenCalled();
      expect(authClientMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
        'signup_started',
        {
          hasCloudHandoff: false,
          hasCreditsIntent: false,
          hasPlanIntent: false,
          method: 'password',
        },
      );
      await waitFor(() => {
        expect(assign).toHaveBeenCalledWith(
          absoluteCallback('/onboarding/post-signup'),
        );
      });
    });

    it('asks the user to verify their email when no session was issued', async () => {
      authClientMocks.signUpEmail.mockResolvedValue({ data: { token: null } });

      render(<SignUpBetterAuth mode="password" />);
      fillAndSubmit();

      expect(await screen.findByText('Check your email')).toBeInTheDocument();
    });

    it('shows the server error and stays on the form', async () => {
      authClientMocks.signUpEmail.mockResolvedValue({
        error: { message: 'User already exists.' },
      });

      render(<SignUpBetterAuth mode="password" />);
      fillAndSubmit();

      expect(
        await screen.findByText('User already exists.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Create account' }),
      ).toBeInTheDocument();
    });

    it('keeps submit disabled until the password is long enough', () => {
      render(<SignUpBetterAuth mode="password" />);

      fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
        target: { value: 'Ada' },
      });
      fireEvent.change(getEmailInput(), {
        target: { value: 'ada@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/), {
        target: { value: 'short' },
      });

      expect(
        screen.getByRole('button', { name: 'Create account' }),
      ).toBeDisabled();
    });
  });
});
