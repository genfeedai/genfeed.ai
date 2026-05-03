import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

const marketingProviderSpy = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@clerk/themes', () => ({
  dark: {},
}));

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => null,
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
    config: Record<string, string | undefined>;
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
        googleAnalyticsId="G-123"
        initialTheme="dark"
        includeLazyModalErrorDebug={false}
        includeSpeedInsights={false}
        includeToaster={false}
        includeVercelAnalytics={false}
        marketingConsentDefault="denied"
        marketingGtmContainerId="GTM-123"
        marketingLinkedinPartnerId="li-123"
        marketingMetaPixelId="meta-123"
        marketingXPixelId="x-123"
      >
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
    expect(marketingProviderSpy).toHaveBeenCalledWith({
      config: {
        gaId: 'G-123',
        gtmContainerId: 'GTM-123',
        linkedinPartnerId: 'li-123',
        metaPixelId: 'meta-123',
        xPixelId: 'x-123',
      },
      consentDefault: 'denied',
    });
  });
});
