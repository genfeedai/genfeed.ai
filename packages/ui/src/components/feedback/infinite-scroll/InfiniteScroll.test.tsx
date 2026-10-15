import { act, render, screen } from '@testing-library/react';
import InfiniteScroll from '@ui/feedback/infinite-scroll/InfiniteScroll';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const observers: Array<{
  callback: ObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  options: IntersectionObserverInit;
}> = [];

class MockIntersectionObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(callback: ObserverCallback, options: IntersectionObserverInit) {
    observers.push({ callback, disconnect: this.disconnect, options });
  }
}

describe('InfiniteScroll', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads more when the sentinel reaches the scroll container', () => {
    const onLoadMore = vi.fn();
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <InfiniteScroll hasMore onLoadMore={onLoadMore} rootMargin="800px" />
      </div>,
    );

    expect(observers).toHaveLength(1);
    expect(observers[0]?.options.root).toBe(screen.getByTestId('scroller'));
    expect(observers[0]?.options.rootMargin).toBe('800px');

    act(() => observers[0]?.callback([{ isIntersecting: true }]));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('observes against the viewport when no ancestor scrolls', () => {
    render(<InfiniteScroll hasMore onLoadMore={vi.fn()} />);

    expect(observers[0]?.options.root).toBeNull();
  });

  it('does not observe while a page is loading or when nothing is left', () => {
    const { rerender } = render(
      <InfiniteScroll hasMore isLoading onLoadMore={vi.fn()} />,
    );
    expect(observers).toHaveLength(0);
    expect(screen.getByTestId('infinite-scroll-sentinel')).toBeInTheDocument();

    rerender(<InfiniteScroll hasMore={false} onLoadMore={vi.fn()} />);
    expect(observers).toHaveLength(0);
    expect(screen.queryByTestId('infinite-scroll-sentinel')).toBeNull();
  });

  it('renders its children above the sentinel', () => {
    render(
      <InfiniteScroll hasMore onLoadMore={vi.fn()}>
        <p>Assets</p>
      </InfiniteScroll>,
    );

    expect(screen.getByText('Assets')).toBeInTheDocument();
  });
});
