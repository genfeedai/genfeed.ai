import { render, screen, waitFor } from '@testing-library/react';
import ProductionDataBanner from '@ui/banners/production-data/ProductionDataBanner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'http://localhost:3010/v1',
  },
}));

describe('ProductionDataBanner', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
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
      screen.getByText(
        'PRODUCTION DATA — Read carefully before making changes',
      ),
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

  it('does not show banner when not on localhost', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ mode: 'production' }), { status: 200 }),
    );

    render(<ProductionDataBanner />);

    // Wait a tick to let any effects settle
    await new Promise((r) => setTimeout(r, 50));

    // Even if the endpoint returns production, banner should not show on non-localhost
    expect(screen.queryByTestId('production-data-banner')).toBeNull();
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
});
