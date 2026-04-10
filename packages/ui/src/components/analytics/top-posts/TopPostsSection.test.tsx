import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';
import '@testing-library/jest-dom';
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
    <img {...props} alt={alt} />
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

  it('renders featured post content when posts exist', () => {
    render(
      <TopPostsSection
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
  });
});
