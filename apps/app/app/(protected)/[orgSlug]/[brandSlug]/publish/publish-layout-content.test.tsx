import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishLayoutContent from './publish-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();
const openAgentComposerMock = vi.fn();
const openModalMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    credentials: [{ id: 'credential-x', label: '@acme', platform: 'twitter' }],
    selectedBrand: { id: 'brand-1', label: 'Acme Creator' },
  })),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: openModalMock,
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalCreateThread: () => null,
  LazyModalPost: () => null,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
  usePathname: () => usePathnameMock(),
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/hooks/use-open-agent-composer', () => ({
  useOpenAgentComposer: () => openAgentComposerMock,
}));

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('PublishLayoutContent', () => {
  beforeEach(() => {
    openAgentComposerMock.mockReset();
    openModalMock.mockReset();
    usePathnameMock.mockReturnValue('/publish/scheduled');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube'),
    );
  });

  it('renders list actions without route-level status tabs', () => {
    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new content/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new content/i }),
    ).not.toBeInTheDocument();
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

  it('seeds the agent composer without leaving Publish', () => {
    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new content/i }));
    fireEvent.click(screen.getByRole('button', { name: /post with agent/i }));

    expect(openAgentComposerMock).toHaveBeenCalledTimes(1);
    expect(openAgentComposerMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /generate a new post for my brand "Acme Creator".*do not ask which brand/i,
      ),
    );
  });

  it('opens first-class X long-form and thread composers', () => {
    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new content/i }));
    fireEvent.click(screen.getByRole('button', { name: /x long post/i }));
    expect(openModalMock).toHaveBeenCalledWith('modal-post-long-form');

    fireEvent.click(screen.getByRole('button', { name: /new content/i }));
    fireEvent.click(screen.getByRole('button', { name: /x thread/i }));
    expect(openModalMock).toHaveBeenCalledWith('modal-thread-create');
  });

  it('skips the container chrome for organization-and-brand-scoped detail routes', () => {
    usePathnameMock.mockReturnValue(
      '/acme-org/acme-creator/publish/posts/post-123',
    );
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    render(
      <PublishLayoutContent>
        <div>detail content</div>
      </PublishLayoutContent>,
    );

    expect(screen.getByText('detail content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new content/i }),
    ).not.toBeInTheDocument();
  });
});
