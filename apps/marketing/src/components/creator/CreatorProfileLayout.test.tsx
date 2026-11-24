import type { CreatorProfileLayoutProps } from '@props/content/creator.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreatorProfileLayout from './CreatorProfileLayout';

vi.mock('./CreatorHeader', () => ({
  default: ({ hasBanner }: { hasBanner: boolean }) => (
    <header data-has-banner={String(hasBanner)} data-testid="header" />
  ),
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
      {...overrides}
    >
      <p>Posts</p>
    </CreatorProfileLayout>,
  );
}

describe('CreatorProfileLayout', () => {
  it('runs the banner across the top, then the header, then the tabs', () => {
    renderLayout();

    const banner = screen.getByRole('img', { name: 'Acme banner' });
    const header = screen.getByTestId('header');
    const tabs = screen.getByRole('navigation', { name: 'Profile sections' });

    expect(banner.compareDocumentPosition(header)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(header.compareDocumentPosition(tabs)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(header.getAttribute('data-has-banner')).toBe('true');
  });

  it('opens with the header when the creator has no banner', () => {
    renderLayout({ brand: { ...brand, bannerUrl: null } });

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('header').getAttribute('data-has-banner')).toBe(
      'false',
    );
  });
});
