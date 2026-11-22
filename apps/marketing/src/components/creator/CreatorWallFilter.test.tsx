import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorWallFilter from './CreatorWallFilter';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

/** Radix menus open from the keyboard: Enter on the trigger, Arrow Right on a facet. */
function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: /^Filters/ }), {
    key: 'Enter',
  });
}

function openPlatforms() {
  openMenu();
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

    openPlatforms();
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

    openPlatforms();

    expect(
      (
        await screen.findByRole('menuitemradio', { name: 'Instagram' })
      ).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('clears back to the whole wall', () => {
    render(
      <CreatorWallFilter
        active="instagram"
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear filters' }));

    expect(push).toHaveBeenCalledWith('/@shayla/posts');
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
