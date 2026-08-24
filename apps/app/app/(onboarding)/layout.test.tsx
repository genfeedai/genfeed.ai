// @vitest-environment jsdom
'use client';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

let OnboardingSetupLayout: typeof import('./layout').default;
let isSignedIn = true;
const navigationMocks = vi.hoisted(() => ({
  pathname: '/onboarding/brand',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
}));

const protectedAuthGateMock = vi.fn(
  ({ children }: { children: React.ReactNode }) =>
    isSignedIn ? (
      <div data-testid="protected-auth-gate">{children}</div>
    ) : (
      <div data-testid="auth-gated" />
    ),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  BrandProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="brand-provider">{children}</div>
  ),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-provider">{children}</div>
  ),
}));

vi.mock('@providers/api-status/api-status.provider', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="api-status-provider">{children}</div>
  ),
}));

vi.mock('@providers/protected-providers/protected-providers', () => ({
  ProtectedAuthGate: (props: { children: React.ReactNode }) =>
    protectedAuthGateMock(props),
}));

vi.mock('@providers/theme-sync/theme-preference-sync', () => ({
  default: () => <div data-testid="theme-preference-sync" />,
}));

vi.mock('@ui/error', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

vi.mock('./onboarding-funnel-analytics', () => ({
  default: () => <div data-testid="onboarding-funnel-analytics" />,
}));

vi.mock('@/components/analytics/AnalyticsOrganizationSync', () => ({
  default: () => <div data-testid="analytics-organization-sync" />,
}));

describe('app/(onboarding)/layout.tsx', () => {
  beforeAll(async () => {
    OnboardingSetupLayout = (await import('./layout')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    isSignedIn = true;
    navigationMocks.pathname = '/onboarding/brand';
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(onboarding)/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('export ');
  });

  it('wraps onboarding providers in the protected auth gate', () => {
    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.getByTestId('protected-auth-gate')).toBeInTheDocument();
    expect(screen.getByTestId('api-status-provider')).toBeInTheDocument();
    expect(screen.getByTestId('user-provider')).toBeInTheDocument();
    expect(screen.getByTestId('theme-preference-sync')).toBeInTheDocument();
    expect(screen.getByTestId('brand-provider')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(
      screen.getByTestId('onboarding-funnel-analytics'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('analytics-organization-sync'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('always uses the protected auth gate regardless of env vars', () => {
    // Better Auth is the only auth layer — ProtectedAuthGate is always active
    // (the old Clerk-era NEXT_PUBLIC_BETTER_AUTH_ENABLED bypass no longer exists)
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'any-value';

    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.getByTestId('protected-auth-gate')).toBeInTheDocument();
    expect(protectedAuthGateMock).toHaveBeenCalled();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('renders desktop onboarding through the protected auth gate when signed in', () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'pk_test_fake';
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    navigationMocks.pathname = '/onboarding/summary';

    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.getByTestId('protected-auth-gate')).toBeInTheDocument();
    expect(protectedAuthGateMock).toHaveBeenCalled();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('gates desktop onboarding when signed out', () => {
    isSignedIn = false;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    navigationMocks.pathname = '/onboarding/summary';

    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.getByTestId('auth-gated')).toBeInTheDocument();
    expect(protectedAuthGateMock).toHaveBeenCalled();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it.each(['/onboarding/brand', '/onboarding/providers'])(
    'lets desktop local %s render without the auth gate',
    (pathname) => {
      isSignedIn = false;
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
      navigationMocks.pathname = pathname;

      render(
        <OnboardingSetupLayout>
          <span data-testid="child">hello</span>
        </OnboardingSetupLayout>,
      );

      expect(
        screen.queryByTestId('protected-auth-gate'),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('auth-gated')).not.toBeInTheDocument();
      expect(protectedAuthGateMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('child')).toHaveTextContent('hello');
    },
  );
});
