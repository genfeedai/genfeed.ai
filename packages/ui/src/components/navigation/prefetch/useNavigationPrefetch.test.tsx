import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  useNavigationIntentPrefetch,
  useNavigationPrefetch,
} from '@ui/navigation/prefetch/useNavigationPrefetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prefetchMock } = vi.hoisted(() => ({
  prefetchMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    prefetch: prefetchMock,
  }),
}));

function PrefetchProbe({ href }: { href?: string }) {
  const prefetchHref = useNavigationPrefetch(href);

  return (
    <button type="button" onFocus={prefetchHref} onMouseEnter={prefetchHref}>
      Prefetch
    </button>
  );
}

describe('useNavigationPrefetch', () => {
  beforeEach(() => {
    prefetchMock.mockClear();
  });

  it('prefetches an internal route once on repeated interactions', () => {
    render(<PrefetchProbe href="/acme/brand/publishing" />);

    const button = screen.getByRole('button', { name: 'Prefetch' });
    fireEvent.mouseEnter(button);
    fireEvent.focus(button);

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith('/acme/brand/publishing', {
      kind: 'auto',
      onInvalidate: expect.any(Function),
    });
  });

  it('ignores external, hash-only, and protocol-relative hrefs', () => {
    const { rerender } = render(<PrefetchProbe href="https://example.com" />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Prefetch' }));

    rerender(<PrefetchProbe href="#section" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Prefetch' }));

    rerender(<PrefetchProbe href="//example.com/path" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Prefetch' }));

    expect(prefetchMock).not.toHaveBeenCalled();
  });
});

function IntentProbe({ href }: { href: string }) {
  const intent = useNavigationIntentPrefetch(href);
  return (
    <button type="button" {...intent}>
      Warm route
    </button>
  );
}

describe('navigation prefetch lifecycle', () => {
  beforeEach(() => {
    prefetchMock.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fetch on mount or a passing hover, but warms a rested hover', () => {
    render(<IntentProbe href="/acme/brand/library/assets" />);
    const button = screen.getByRole('button', { name: 'Warm route' });
    expect(prefetchMock).not.toHaveBeenCalled();
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);
  });

  it('warms keyboard focus and cancels transient focus', () => {
    render(<IntentProbe href="/acme/brand/analytics/overview" />);
    const button = screen.getByRole('button', { name: 'Warm route' });
    fireEvent.focus(button);
    fireEvent.blur(button);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
    fireEvent.focus(button);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work when unmounted or the tenant destination changes', () => {
    const { rerender, unmount } = render(
      <IntentProbe href="/old/brand/agent" />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Warm route' }));
    rerender(<IntentProbe href="/new/brand/agent" />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole('button', { name: 'Warm route' }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
  });

  it('warms again on the next interaction after Next invalidates the route', () => {
    render(<PrefetchProbe href="/acme/brand/agent" />);
    const button = screen.getByRole('button', { name: 'Prefetch' });
    fireEvent.focus(button);
    const options = prefetchMock.mock.calls[0]?.[1] as {
      onInvalidate: () => void;
    };
    options.onInvalidate();
    expect(prefetchMock).toHaveBeenCalledTimes(1);
    fireEvent.mouseEnter(button);
    expect(prefetchMock).toHaveBeenCalledTimes(2);
  });
});
