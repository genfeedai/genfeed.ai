import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostsContent from '@/features/analytics/posts-list/posts-content';

const openRemix = vi.fn();
const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/analytics/posts',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock('@/features/research/remix/RemixBriefInspector', () => ({
  default: () => null,
}));

vi.mock('@/features/analytics/posts-list/analytics-posts-list', () => ({
  default: () => <div data-testid="posts-list" />,
}));

vi.mock('@/features/research/remix/DiscoveryRemixProvider', () => ({
  DiscoveryRemixProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useDiscoveryRemix: () => ({ openRemix }),
}));

describe('PostsContent remix deep link', () => {
  beforeEach(() => {
    openRemix.mockReset();
    replace.mockReset();
    search = '';
  });

  it('opens the remix of an owned post once and drops the parameter', async () => {
    search = 'remixPostId=post-1&range=30d';

    render(<PostsContent />);

    await waitFor(() =>
      expect(openRemix).toHaveBeenCalledWith({
        kind: 'owned_post',
        postId: 'post-1',
      }),
    );
    expect(openRemix).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      '/acme/brand/analytics/posts?range=30d',
    );
  });

  it('opens the remix of an imported source post', async () => {
    search = 'remixSourcePostId=source-1';

    render(<PostsContent />);

    await waitFor(() =>
      expect(openRemix).toHaveBeenCalledWith({
        kind: 'source_post',
        sourcePostId: 'source-1',
      }),
    );
    expect(replace).toHaveBeenCalledWith('/acme/brand/analytics/posts');
  });

  it('opens nothing without a remix parameter', () => {
    render(<PostsContent />);

    expect(openRemix).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
