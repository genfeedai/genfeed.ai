import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorWallFilter from './CreatorWallFilter';

describe('CreatorWallFilter', () => {
  it('links each platform to the wall narrowed to it and marks the active one', () => {
    render(
      <CreatorWallFilter
        active="instagram"
        handle="shayla"
        platforms={['instagram', 'tiktok']}
      />,
    );

    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/@shayla/posts',
    );
    const instagram = screen.getByRole('link', { name: 'Instagram' });
    expect(instagram.getAttribute('href')).toBe(
      '/@shayla/posts?platform=instagram',
    );
    expect(instagram.getAttribute('aria-current')).toBe('page');
    expect(
      screen.getByRole('link', { name: 'TikTok' }).getAttribute('aria-current'),
    ).toBeNull();
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
