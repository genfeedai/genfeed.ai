import { fireEvent, render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorWallFilter from './CreatorWallFilter';

const push = vi.fn();

// `next/dynamic` never resolves its chunk under vitest; React.lazy loads the
// same real menu from the same import.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<never> }>) => {
    const Menu = lazy(loader);
    return function LazyMenu(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Menu {...(props as never)} />
        </Suspense>
      );
    };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

/** Radix menus open from the keyboard: Enter on the trigger, Arrow Right on a facet. */
async function openMenu() {
  fireEvent.keyDown(await screen.findByRole('button', { name: /^Filters/ }), {
    key: 'Enter',
  });
}

async function openPlatforms() {
  await openMenu();
  const facet = screen.getByRole('menuitem', { name: /Platform/ });
  facet.focus();
  fireEvent.keyDown(facet, { key: 'ArrowRight' });
}

describe('CreatorWallFilter', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('narrows the wall to the chosen platform', async () => {
    render(
      <CreatorWallFilter
        active={null}
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    await openPlatforms();
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'TikTok' }),
    );

    expect(push).toHaveBeenCalledWith('/@shayla/posts?platform=tiktok');
  });

  it('marks the active platform', async () => {
    render(
      <CreatorWallFilter
        active="instagram"
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    await openPlatforms();

    expect(
      (
        await screen.findByRole('menuitemradio', { name: 'Instagram' })
      ).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('clears back to the whole wall', async () => {
    render(
      <CreatorWallFilter
        active="instagram"
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear filters' }));

    expect(push).toHaveBeenCalledWith('/@shayla/posts');
  });

  it('puts a link for the whole wall and each platform in the server HTML', () => {
    const html = renderToString(
      <CreatorWallFilter
        active="tiktok"
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );
    const links = [
      ...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)</g),
    ].map(([, href, label]) => [href, label]);

    expect(links).toEqual([
      ['/@shayla/posts', 'All platforms'],
      ['/@shayla/posts?platform=instagram', 'Instagram'],
      ['/@shayla/posts?platform=tiktok', 'TikTok'],
    ]);
    expect(html).toMatch(/aria-current="page"[^>]*>TikTok</);
  });

  it('links to the whole wall as the current view when no platform is chosen', () => {
    const html = renderToString(
      <CreatorWallFilter
        active={null}
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    expect(html).toMatch(/aria-current="page"[^>]*>All platforms</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>(Instagram|TikTok)</);
  });

  it('shows nothing when the creator has one platform or none', () => {
    const { container } = render(
      <CreatorWallFilter
        active={null}
        handle="shayla"
        platforms={['instagram']}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
