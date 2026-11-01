import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NavigationProgress, {
  NAVIGATION_PROGRESS_DELAY_MS,
  NAVIGATION_PROGRESS_MAX_MS,
} from '@/components/shell/NavigationProgress';
import { dispatchNavigationStart } from '@/lib/navigation/navigation-events';

const navigationState = vi.hoisted(() => ({ pathname: '/acme/brand/library' }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

function startNavigation(url: string): void {
  act(() => {
    dispatchNavigationStart({ navigationType: 'push', url });
  });
  // The arm runs a macrotask after the router hook.
  act(() => {
    vi.advanceTimersByTime(0);
  });
}

describe('NavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigationState.pathname = '/acme/brand/library';
    window.history.replaceState(null, '', '/acme/brand/library');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading bar while a slow navigation has not committed', () => {
    render(<NavigationProgress />);

    startNavigation('/acme/brand/analytics/overview');
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
    });

    expect(
      screen.getByRole('progressbar', { name: 'Loading page' }),
    ).toBeInTheDocument();
  });

  it('clears the bar once the destination commits', () => {
    const { rerender } = render(<NavigationProgress />);

    startNavigation('/acme/brand/analytics/overview');
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
    });
    navigationState.pathname = '/acme/brand/analytics/overview';
    window.history.replaceState(null, '', '/acme/brand/analytics/overview');
    rerender(<NavigationProgress />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('never shows the bar for a navigation that commits within the delay', () => {
    const { rerender } = render(<NavigationProgress />);

    startNavigation('/acme/brand/analytics/overview');
    navigationState.pathname = '/acme/brand/analytics/overview';
    window.history.replaceState(null, '', '/acme/brand/analytics/overview');
    rerender(<NavigationProgress />);
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    ['the current page', '/acme/brand/library'],
    ['a hash on the current page', '/acme/brand/library#assets'],
  ])('ignores a transition to %s', (_label, url) => {
    render(<NavigationProgress />);

    startNavigation(url);
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('gives up on a navigation that never commits', () => {
    render(<NavigationProgress />);

    startNavigation('/acme/brand/analytics/overview');
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_MAX_MS);
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
