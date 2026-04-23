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

const protectedAuthGateMock = vi.fn(
  ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-auth-gate">{children}</div>
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

vi.mock('@ui/error', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

describe('app/(onboarding)/layout.tsx', () => {
  beforeAll(async () => {
    OnboardingSetupLayout = (await import('./layout')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(onboarding)/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('export ');
  });

  it('wraps onboarding providers in the protected auth gate when Clerk is enabled', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';

    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.getByTestId('protected-auth-gate')).toBeInTheDocument();
    expect(screen.getByTestId('api-status-provider')).toBeInTheDocument();
    expect(screen.getByTestId('user-provider')).toBeInTheDocument();
    expect(screen.getByTestId('brand-provider')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('bypasses the protected auth gate in local mode', () => {
    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.queryByTestId('protected-auth-gate')).not.toBeInTheDocument();
    expect(protectedAuthGateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('bypasses the protected auth gate in desktop mode', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

    render(
      <OnboardingSetupLayout>
        <span data-testid="child">hello</span>
      </OnboardingSetupLayout>,
    );

    expect(screen.queryByTestId('protected-auth-gate')).not.toBeInTheDocument();
    expect(protectedAuthGateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });
});
