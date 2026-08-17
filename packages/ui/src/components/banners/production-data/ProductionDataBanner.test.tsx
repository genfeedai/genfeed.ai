import { render, screen, waitFor } from '@testing-library/react';
import ProductionDataBanner from '@ui/banners/production-data/ProductionDataBanner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'http://localhost:3010/v1',
  },
}));

function clearDocumentCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: jsdom fixture for the banner cookie guard
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

function clearPlaywrightBannerMarkers(): void {
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST;
  delete process.env.NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP;
  clearDocumentCookies();
}

function mockDbModeFetch(mode = 'production') {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ mode }), { status: 200 }));
}

async function expectNoDbModeFetch(
  fetchSpy: ReturnType<typeof mockDbModeFetch>,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(screen.queryByTestId('production-data-banner')).toBeNull();
}

describe('ProductionDataBanner', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearPlaywrightBannerMarkers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'localhost' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
    clearPlaywrightBannerMarkers();
    vi.restoreAllMocks();
  });

  it('shows banner when db-mode is production on localhost', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'production' }), { status: 200 }),
    );

    render(<ProductionDataBanner />);

    await waitFor(() => {
      expect(screen.getByTestId('production-data-banner')).toBeDefined();
    });

    expect(
      screen.getByText('PRODUCTION DATA: Read carefully before making changes'),
    ).toBeDefined();
  });

  it('does not show banner when db-mode is development', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: 'development' }), { status: 200 }),
      );

    render(<ProductionDataBanner />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('production-data-banner')).toBeNull();
  });

  it('does not fetch or show the banner when not on localhost', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });

    const fetchSpy = mockDbModeFetch();

    render(<ProductionDataBanner />);

    await expectNoDbModeFetch(fetchSpy);
  });

  it('does not show banner when endpoint returns error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    render(<ProductionDataBanner />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('production-data-banner')).toBeNull();
  });

  it('does not fetch db-mode when NEXT_PUBLIC_PLAYWRIGHT_TEST is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLAYWRIGHT_TEST', 'true');
    const fetchSpy = mockDbModeFetch();

    render(<ProductionDataBanner />);

    await expectNoDbModeFetch(fetchSpy);
  });

  it('does not fetch db-mode when NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP', 'true');
    const fetchSpy = mockDbModeFetch();

    render(<ProductionDataBanner />);

    await expectNoDbModeFetch(fetchSpy);
  });

  it('does not fetch db-mode when the mocked Playwright cookie is set', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom fixture for the mocked-suite marker
    document.cookie = '__playwright_test=true';
    const fetchSpy = mockDbModeFetch();

    render(<ProductionDataBanner />);

    await expectNoDbModeFetch(fetchSpy);
  });

  it('does not fetch db-mode when the authenticated Playwright banner cookie is set', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom fixture for the authed banner marker
    document.cookie = '__genfeed_playwright_banner=1';
    const fetchSpy = mockDbModeFetch();

    render(<ProductionDataBanner />);

    await expectNoDbModeFetch(fetchSpy);
  });
});
