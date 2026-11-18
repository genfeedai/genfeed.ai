import type { CreatorProfileLayoutProps } from '@props/content/creator.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreatorProfileLayout from './CreatorProfileLayout';

vi.mock('./CreatorRail', () => ({
  default: () => <div data-testid="rail" />,
}));
vi.mock('./CreatorTabs', () => ({
  default: () => <nav aria-label="Profile sections" />,
}));

const brand = {
  bannerUrl: 'https://cdn.example.com/banner.jpg',
  id: 'brand-1',
  label: 'Acme',
} as CreatorProfileLayoutProps['brand'];

function renderLayout(overrides: Partial<CreatorProfileLayoutProps> = {}) {
  return render(
    <CreatorProfileLayout
      active={null}
      brand={brand}
      counts={{ articles: 0, images: 0, posts: 3, videos: 0 }}
      handle="acme"
      referralCode={null}
      {...overrides}
    >
      <p>Posts</p>
    </CreatorProfileLayout>,
  );
}

describe('CreatorProfileLayout', () => {
  it('puts the banner over the feed, next to the rail instead of above it', () => {
    renderLayout();

    const banner = screen.getByRole('img', { name: 'Acme banner' });
    const rail = screen.getByTestId('rail');
    const tabs = screen.getByRole('navigation', { name: 'Profile sections' });

    expect(rail.compareDocumentPosition(banner)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(banner.compareDocumentPosition(tabs)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('opens the feed with the tabs when the creator has no banner', () => {
    renderLayout({ brand: { ...brand, bannerUrl: null } });

    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByRole('navigation', { name: 'Profile sections' }),
    ).toBeTruthy();
  });
});
