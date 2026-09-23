import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishingLayoutContent from './publishing-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();
const openAgentComposerMock = vi.fn();
const openModalMock = vi.fn();

const brandMock = vi.hoisted(() => ({
  label: 'Acme Creator',
  credentials: [] as { id: string; platform: string }[],
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    credentials: brandMock.credentials,
    selectedBrand: { id: 'brand-1', label: brandMock.label },
  })),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  // Referenced lazily: vi.mock is hoisted above the const declarations above,
  // so reading openModalMock eagerly here hits the temporal dead zone.
  openModal: (...args: unknown[]) => openModalMock(...args),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalCreateThread: () => null,
  LazyModalPost: () => null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

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

describe('PublishingLayoutContent', () => {
  beforeEach(() => {
    brandMock.label = 'Acme Creator';
    openAgentComposerMock.mockReset();
    openModalMock.mockReset();
    usePathnameMock.mockReturnValue('/publishing/posts');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube'),
    );
  });

  it('lets Campaigns own their chrome instead of the Posts New post menu', () => {
    usePathnameMock.mockReturnValue('/acme/moonrise/publishing/campaigns');

    render(
      <PublishingLayoutContent>
        <div>campaign desk</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('campaign desk')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new post/i }),
    ).not.toBeInTheDocument();
  });

  it('lets Calendar own its controls without an extra publishing toolbar', () => {
    usePathnameMock.mockReturnValue('/demo/FUDNEWS/publishing/calendar');

    render(
      <PublishingLayoutContent>
        <div>calendar grid</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('calendar grid')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new post/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('container')).not.toBeInTheDocument();
  });

  it('renders the New post menu and leaves filters to the posts list', () => {
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new post/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new post/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'All statuses' }),
    ).not.toBeInTheDocument();
  });

  it('opens the manual composer without a connected account', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>posts</div>
      </PublishingLayoutContent>,
    );
    await user.click(screen.getByRole('button', { name: /new post/i }));
    await user.click(screen.getByRole('menuitem', { name: /social post/i }));
    expect(openModalMock).toHaveBeenCalledWith('modal-post-create');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(openAgentComposerMock).not.toHaveBeenCalled();
  });

  it('keeps agent assistance optional with a clean prompt', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>posts</div>
      </PublishingLayoutContent>,
    );
    await user.click(screen.getByRole('button', { name: /new post/i }));
    await user.click(screen.getByRole('menuitem', { name: /ask agent/i }));
    expect(openAgentComposerMock).toHaveBeenCalledWith(
      'Draft a social post for my brand.',
    );
  });

  it('opens first-class X long-form and thread composers', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    await user.click(await screen.findByRole('button', { name: /new post/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /x long post/i }),
    );
    expect(openModalMock).toHaveBeenCalledWith('modal-post-long-form');

    await waitFor(() => {
      expect(document.body).not.toHaveAttribute('data-scroll-locked');
    });

    await user.click(await screen.findByRole('button', { name: /new post/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /x thread/i }),
    );
    expect(openModalMock).toHaveBeenCalledWith('modal-thread-create');
  });

  it('skips the container chrome for organization-and-brand-scoped detail routes', () => {
    usePathnameMock.mockReturnValue(
      '/acme-org/acme-creator/publishing/posts/post-123',
    );
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    render(
      <PublishingLayoutContent>
        <div>detail content</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('detail content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new post/i }),
    ).not.toBeInTheDocument();
  });
});
