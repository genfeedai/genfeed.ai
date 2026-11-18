import type { IVideo } from '@genfeedai/contracts/interfaces';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: () => <span>image tile</span>,
  LazyMasonryVideo: () => <span>video tile</span>,
}));

const { default: CommunityFeaturedHero } = await import(
  './CommunityFeaturedHero'
);

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** Each watched element's observer; links watch for prefetching too. */
const watchers = new Map<Element, ObserverCallback>();

class FakeIntersectionObserver {
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }
  disconnect(): void {}
  observe(target: Element): void {
    watchers.set(target, this.callback);
  }
  unobserve(): void {}
}

function scrollIntoView(target: HTMLElement): void {
  watchers.get(target)?.([{ isIntersecting: true, target }]);
}

/** The ids each view request counted. */
const countedIds: string[][] = [];

beforeEach(() => {
  countedIds.length = 0;
  watchers.clear();
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const { ids } = JSON.parse(String(init.body)) as { ids: string[] };
      countedIds.push(ids);
      return new Response(JSON.stringify({ data: { views: {} } }));
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CommunityFeaturedHero', () => {
  it('counts a view of the featured video once it is on screen', async () => {
    render(
      <CommunityFeaturedHero
        featured={{
          handle: 'shayla',
          kind: 'video',
          media: { id: 'video-1' } as IVideo,
        }}
      />,
    );

    const tile = screen.getByText('video tile').parentElement as HTMLElement;
    act(() => scrollIntoView(tile));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(countedIds).toEqual([['video-1']]);
    expect(screen.getByRole('link', { name: '@shayla' })).toHaveAttribute(
      'href',
      '/@shayla',
    );
  });
});
