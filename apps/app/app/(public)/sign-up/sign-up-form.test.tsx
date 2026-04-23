// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SignUpForm from './sign-up-form';

const signUpSpy = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: object) => {
    signUpSpy(props);
    return <div>Sign Up Component</div>;
  },
}));

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/mock-logo.png',
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

describe('SignUpForm', () => {
  beforeEach(() => {
    signUpSpy.mockClear();
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

  it('renders the SignUp component after mount with the expected Clerk props', async () => {
    const { container } = render(<SignUpForm />);

    expect(container.firstChild).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sign Up Component')).toBeInTheDocument();
    });

    expect(signUpSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'hash',
        signInUrl: '/login',
      }),
    );
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
      expect(screen.getByText('Sign Up Component')).toBeInTheDocument();
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
