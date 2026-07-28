import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostsLayoutContent from './posts-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({ selectedBrand: null })),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
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
    usePathnameMock.mockReturnValue('/posts/scheduled');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube'),
    );
  });

  it('renders list actions without route-level status tabs', () => {
    render(
      <PostsLayoutContent>
        <div>child content</div>
      </PostsLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new release/i })).toHaveAttribute(
      'href',
      '/acme-org/acme-creator/posts/composer',
    );
    expect(
      screen.queryByRole('link', { name: /drafts/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /scheduled/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /published/i }),
    ).not.toBeInTheDocument();
  });

  it('skips the container chrome for organization-and-brand-scoped detail routes', () => {
    usePathnameMock.mockReturnValue('/acme-org/acme-creator/posts/post-123');
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    render(
      <PostsLayoutContent>
        <div>detail content</div>
      </PostsLayoutContent>,
    );

    expect(screen.getByText('detail content')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new release/i }),
    ).not.toBeInTheDocument();
  });
});
