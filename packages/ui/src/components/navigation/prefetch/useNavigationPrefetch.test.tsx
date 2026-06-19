import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prefetchMock } = vi.hoisted(() => ({
  prefetchMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
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
    render(<PrefetchProbe href="/acme/brand/posts" />);

    const button = screen.getByRole('button', { name: 'Prefetch' });
    fireEvent.mouseEnter(button);
    fireEvent.focus(button);

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith('/acme/brand/posts');
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
