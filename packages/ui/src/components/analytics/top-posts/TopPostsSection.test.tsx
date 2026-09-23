import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    assetsEndpoint: 'https://assets.example.com',
  },
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <input type="image" {...props} alt={alt} />
  ),
}));

describe('TopPostsSection', () => {
  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    } as typeof IntersectionObserver;
  });

  it('renders the empty state copy when no posts exist', () => {
    render(<TopPostsSection posts={[]} />);

    expect(screen.getByText('Top Posts')).toBeInTheDocument();
    expect(
      screen.getByText('No posts found for this period'),
    ).toBeInTheDocument();
  });

  it('uses one card skeleton before posts arrive', () => {
    render(<TopPostsSection posts={[]} isLoading />);
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Loading Top Posts',
    );
    expect(screen.getByRole('status').childElementCount).toBe(0);
    expect(
      screen.queryByText('No posts found for this period'),
    ).not.toBeInTheDocument();
  });

  it('keeps existing posts visible during a refresh', () => {
    render(
      <TopPostsSection
        isLoading
        posts={[
          {
            label: 'Launch post',
            platform: 'instagram',
            postId: 'post-1',
            totalComments: 5,
            totalLikes: 30,
            totalViews: 120,
          },
        ]}
      />,
    );

    expect(screen.getByText('Launch post')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
