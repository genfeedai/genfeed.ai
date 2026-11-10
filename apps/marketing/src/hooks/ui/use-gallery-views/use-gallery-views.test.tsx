import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryViews } from './use-gallery-views';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let notify: ObserverCallback = () => undefined;

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    notify = callback;
  }
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

function Gallery({ ids }: { ids: string[] }): React.ReactElement {
  const { counts, observe } = useGalleryViews();
  return (
    <ul>
      {ids.map((id) => (
        <li data-gallery-id={id} key={id} ref={observe}>
          {id}: {counts[id] ?? 'none'}
        </li>
      ))}
    </ul>
  );
}

function seeItems(ids: string[]): void {
  notify(
    ids.map((id) => ({
      isIntersecting: true,
      target: screen.getByText(new RegExp(`^${id}:`)),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const { ids } = JSON.parse(String(init.body)) as { ids: string[] };
      return new Response(
        JSON.stringify({
          data: { views: Object.fromEntries(ids.map((id) => [id, 7])) },
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useGalleryViews', () => {
  it('counts the items seen, in one request, and shows their counts', async () => {
    render(<Gallery ids={['video-1', 'video-2', 'video-3']} />);

    act(() => seeItems(['video-1', 'video-2']));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('video-1: 7')).toBeInTheDocument();
    expect(screen.getByText('video-2: 7')).toBeInTheDocument();
    expect(screen.getByText('video-3: none')).toBeInTheDocument();
  });

  it('counts an item once however often it comes back on screen', async () => {
    render(<Gallery ids={['video-1']} />);

    act(() => seeItems(['video-1']));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    act(() => seeItems(['video-1']));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
