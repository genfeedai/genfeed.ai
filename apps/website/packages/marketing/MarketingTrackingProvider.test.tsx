import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingTrackingConfig } from './browser';
import { MARKETING_CONSENT_STORAGE_KEY } from './consent';
import { WEBSITE_MARKETING_EVENTS } from './events';
import MarketingTrackingProvider from './MarketingTrackingProvider';

const browserMocks = vi.hoisted(() => ({
  loadMarketingTags: vi.fn(),
  setGoogleConsent: vi.fn(),
  trackWebsiteMarketingEvent: vi.fn(
    (event: { eventId?: string; name: string }) =>
      event.eventId ?? `${event.name}:test`,
  ),
}));

const navigationMocks = vi.hoisted(() => ({
  pathname: '/',
  searchParams: new URLSearchParams(),
}));

const localStorageStore = new Map<string, string>();
const localStorageMock = {
  clear: () => localStorageStore.clear(),
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, value);
  },
};

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock('./browser', () => ({
  loadMarketingTags: browserMocks.loadMarketingTags,
  setGoogleConsent: browserMocks.setGoogleConsent,
  trackWebsiteMarketingEvent: browserMocks.trackWebsiteMarketingEvent,
}));

function renderProvider(
  children: ReactNode = <button type="button">Child</button>,
  config: MarketingTrackingConfig = {
    gtmContainerId: 'GTM-TEST',
  },
) {
  return render(
    <MarketingTrackingProvider config={config} consentDefault="denied">
      {children}
    </MarketingTrackingProvider>,
  );
}

function dispatchTrackedButton(action: string): void {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('genfeed:marketing:button-click', {
        detail: {
          trackingData: { action },
          trackingName: 'test_cta_click',
        },
      }),
    );
  });
}

describe('MarketingTrackingProvider', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    window.localStorage.clear();
    navigationMocks.pathname = '/';
    navigationMocks.searchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('fails closed while consent is unavailable or denied', async () => {
    renderProvider();

    await screen.findByRole('button', { name: /accept/i });
    dispatchTrackedButton('book_demo');

    expect(browserMocks.loadMarketingTags).not.toHaveBeenCalled();
    expect(browserMocks.trackWebsiteMarketingEvent).not.toHaveBeenCalled();
  });

  it('does not load marketing tags when only analytics storage is granted', async () => {
    window.localStorage.setItem(
      MARKETING_CONSENT_STORAGE_KEY,
      JSON.stringify({
        adStorage: 'denied',
        analyticsStorage: 'granted',
        updatedAt: '2026-06-30T00:00:00.000Z',
      }),
    );

    renderProvider();

    await waitFor(() =>
      expect(browserMocks.setGoogleConsent).toHaveBeenCalledWith({
        adStorage: 'denied',
        analyticsStorage: 'granted',
      }),
    );
    dispatchTrackedButton('book_demo');

    expect(browserMocks.loadMarketingTags).not.toHaveBeenCalled();
    expect(browserMocks.trackWebsiteMarketingEvent).not.toHaveBeenCalled();
  });

  it('shows the consent prompt when retargeting routes are configured without GTM', async () => {
    renderProvider(<button type="button">Child</button>, {
      retargetingProviders: [{ pixelId: 'meta-pixel', provider: 'meta' }],
    });

    expect(
      await screen.findByRole('button', { name: /accept/i }),
    ).toBeVisible();
    expect(browserMocks.loadMarketingTags).not.toHaveBeenCalled();
  });

  it('loads tags and routes typed page and CTA events after consent', async () => {
    navigationMocks.pathname = '/pricing';
    renderProvider();

    fireEvent.click(await screen.findByRole('button', { name: /accept/i }));

    await waitFor(() =>
      expect(browserMocks.loadMarketingTags).toHaveBeenCalledWith(
        {
          gtmContainerId: 'GTM-TEST',
        },
        expect.objectContaining({ adStorage: 'granted' }),
      ),
    );
    await waitFor(() =>
      expect(browserMocks.trackWebsiteMarketingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: WEBSITE_MARKETING_EVENTS.PAGE_VIEW,
        }),
        expect.objectContaining({
          config: { gtmContainerId: 'GTM-TEST' },
          consent: expect.objectContaining({ adStorage: 'granted' }),
        }),
      ),
    );

    browserMocks.trackWebsiteMarketingEvent.mockClear();
    dispatchTrackedButton('book_demo');

    expect(
      browserMocks.trackWebsiteMarketingEvent.mock.calls.map(
        ([event]) => event.name,
      ),
    ).toEqual([
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.BOOK_CALL,
    ]);
  });
});
