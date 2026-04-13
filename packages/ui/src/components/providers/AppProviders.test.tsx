import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerkProviderSpy = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    appearance?: Record<string, unknown>;
    signInUrl?: string;
  }) => {
    clerkProviderSpy(props);
    return <>{children}</>;
  },
}));

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({
    resolvedTheme: 'dark',
  }),
}));

describe('AppProviders', () => {
  let AppProviders: typeof import('@ui/providers/AppProviders').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    const module = await import('@ui/providers/AppProviders');
    AppProviders = module.default;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  });

  it('renders one ClerkProvider with theme-aware appearance at the app root', () => {
    render(
      <AppProviders
        initialTheme="dark"
        clerkProps={{ signInUrl: '/login' }}
        includeLazyModalErrorDebug={false}
        includeSpeedInsights={false}
        includeToaster={false}
        includeVercelAnalytics={false}
      >
        <div>Child content</div>
      </AppProviders>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(clerkProviderSpy).toHaveBeenCalledTimes(1);
    expect(clerkProviderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          theme: expect.any(Object),
        }),
        signInUrl: '/login',
      }),
    );
  });
});
