import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

const marketingProviderSpy = vi.fn();

vi.mock('@genfeedai/auth-client/react', () => ({
  BetterAuthProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@genfeedai/auth-client/themes', () => ({
  dark: {},
}));

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

vi.mock('../../marketing/MarketingTrackingProvider', () => ({
  default: ({
    children,
    config,
    consentDefault,
  }: {
    children: ReactNode;
    config: Record<string, unknown>;
    consentDefault: string;
  }) => {
    marketingProviderSpy({ config, consentDefault });
    return <>{children}</>;
  },
}));

describe('website AppProviders', () => {
  it('passes marketing tracking config through one provider', () => {
    render(
      <AppProviders
        initialTheme="dark"
        includeLazyModalErrorDebug={false}
        includeToaster={false}
        marketingConsentDefault="denied"
        marketingGtmContainerId="GTM-123"
      >
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
    expect(marketingProviderSpy).toHaveBeenCalledWith({
      config: {
        gtmContainerId: 'GTM-123',
      },
      consentDefault: 'denied',
    });
  });
});
