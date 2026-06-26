// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SignUpForm from './sign-up-form';

const authClientMocks = vi.hoisted(() => ({
  magicLink: vi.fn(),
  social: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  signIn: {
    magicLink: authClientMocks.magicLink,
    social: authClientMocks.social,
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-form-layout">{children}</div>
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

  it('renders the Better Auth sign-up magic-link form', () => {
    render(<SignUpForm />);

    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with email' }),
    ).toBeDisabled();
  });

  it('sends a sign-up magic link with the callback URL', async () => {
    window.history.replaceState({}, '', '/sign-up?callbackUrl=%2Fonboarding');

    render(<SignUpForm />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with email' }),
    );

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding'),
        email: 'new@example.com',
      });
    });
    expect(screen.getByText('Check your email')).toBeInTheDocument();
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

  it('does not persist invalid access mode or malformed credit handoff params', async () => {
    window.history.replaceState(
      {},
      '',
      '/sign-up?credits=500abc&brandDomain=https://www.acme.co/path&accessMode=admin',
    );

    render(<SignUpForm />);

    await waitFor(() => {
      expect(getEmailInput()).toBeInTheDocument();
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
