import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NavigationProgress, {
  NAVIGATION_PROGRESS_DELAY_MS,
  NAVIGATION_PROGRESS_MAX_MS,
} from '@/components/shell/NavigationProgress';
import { captureAnalyticsEvent } from '@/lib/analytics/posthog-client';
import { dispatchNavigationStart } from '@/lib/navigation/navigation-events';

const navigationState = vi.hoisted(() => ({ pathname: '/acme/brand/library' }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@/lib/analytics/posthog-client', () => ({
  captureAnalyticsEvent: vi.fn(),
}));

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
    vi.mocked(captureAnalyticsEvent).mockClear();
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

  describe('analytics', () => {
    function commitTo(path: string, rerender: (ui: JSX.Element) => void): void {
      navigationState.pathname = path;
      window.history.replaceState(null, '', path);
      rerender(<NavigationProgress />);
    }

    it('records one event with the wait when a blocked navigation commits', () => {
      const { rerender } = render(<NavigationProgress />);

      startNavigation('/acme/brand/publishing/posts/665f1c2ab4d3e8a1f0c9d7e2');
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS + 450);
      });
      commitTo(
        '/acme/brand/publishing/posts/665f1c2ab4d3e8a1f0c9d7e2',
        rerender,
      );

      expect(captureAnalyticsEvent).toHaveBeenCalledTimes(1);
      expect(captureAnalyticsEvent).toHaveBeenCalledWith('navigation_blocked', {
        fromRoute: '/:orgSlug/:brandSlug/library',
        navigationType: 'push',
        outcome: 'committed',
        toRoute: '/:orgSlug/:brandSlug/publishing/posts/:id',
        waitMs: NAVIGATION_PROGRESS_DELAY_MS + 450,
      });
    });

    it('records nothing for a navigation that commits within the delay', () => {
      const { rerender } = render(<NavigationProgress />);

      startNavigation('/acme/brand/analytics/overview');
      commitTo('/acme/brand/analytics/overview', rerender);
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_MAX_MS);
      });

      expect(captureAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('records nothing for a transition that does not change the location', () => {
      render(<NavigationProgress />);

      startNavigation('/acme/brand/library#assets');
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_MAX_MS);
      });

      expect(captureAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('records an abandoned event when the navigation never commits', () => {
      render(<NavigationProgress />);

      startNavigation('/acme/brand/analytics/overview');
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_MAX_MS);
      });

      expect(captureAnalyticsEvent).toHaveBeenCalledTimes(1);
      expect(captureAnalyticsEvent).toHaveBeenCalledWith('navigation_blocked', {
        fromRoute: '/:orgSlug/:brandSlug/library',
        navigationType: 'push',
        outcome: 'abandoned',
        toRoute: '/:orgSlug/:brandSlug/analytics/overview',
        waitMs: NAVIGATION_PROGRESS_MAX_MS,
      });
    });

    it('records the first navigation as abandoned when a second one replaces it', () => {
      const { rerender } = render(<NavigationProgress />);

      startNavigation('/acme/brand/analytics/overview');
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS + 100);
      });
      startNavigation('/acme/brand/automation/workflows');
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS + 200);
      });
      commitTo('/acme/brand/automation/workflows', rerender);

      expect(captureAnalyticsEvent).toHaveBeenCalledTimes(2);
      expect(captureAnalyticsEvent).toHaveBeenNthCalledWith(
        1,
        'navigation_blocked',
        expect.objectContaining({
          outcome: 'abandoned',
          toRoute: '/:orgSlug/:brandSlug/analytics/overview',
        }),
      );
      expect(captureAnalyticsEvent).toHaveBeenNthCalledWith(
        2,
        'navigation_blocked',
        expect.objectContaining({
          outcome: 'committed',
          toRoute: '/:orgSlug/:brandSlug/automation/workflows',
        }),
      );
    });

    it('sends no organization slug, brand slug, record id or query', () => {
      render(<NavigationProgress />);

      startNavigation(
        '/acme/brand/publishing/posts/665f1c2ab4d3e8a1f0c9d7e2?title=Launch+plan',
      );
      act(() => {
        vi.advanceTimersByTime(NAVIGATION_PROGRESS_MAX_MS);
      });

      const sent = JSON.stringify(vi.mocked(captureAnalyticsEvent).mock.calls);
      expect(sent).not.toMatch(/acme|\/brand\/|665f1c2a|Launch/);
    });
  });
});
