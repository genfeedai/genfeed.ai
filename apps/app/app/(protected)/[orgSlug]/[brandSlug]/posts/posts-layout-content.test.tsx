import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostsLayoutContent from './posts-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('PostsLayoutContent', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/posts');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube&status=scheduled'),
    );
  });

  it('renders publisher tabs with canonical query hrefs and active state', () => {
    render(
      <PostsLayoutContent>
        <div>child content</div>
      </PostsLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /drafts/i })).toHaveAttribute(
      'href',
      '/posts?platform=youtube',
    );
    expect(screen.getByRole('tab', { name: /scheduled/i })).toHaveAttribute(
      'href',
      '/posts?status=scheduled&platform=youtube',
    );
    expect(screen.getByRole('tab', { name: /published/i })).toHaveAttribute(
      'href',
      '/posts?status=public&platform=youtube',
    );
    expect(screen.getByRole('tab', { name: /scheduled/i })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('skips the container chrome for detail routes', () => {
    usePathnameMock.mockReturnValue('/posts/post-123');
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    render(
      <PostsLayoutContent>
        <div>detail content</div>
      </PostsLayoutContent>,
    );

    expect(screen.getByText('detail content')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
