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

const brandMock = vi.hoisted(() => ({ label: 'Acme Creator' }));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    credentials: [{ id: 'credential-x', label: '@acme', platform: 'twitter' }],
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

  it('lets Campaigns own their chrome instead of the Posts New content menu', () => {
    usePathnameMock.mockReturnValue('/acme/moonrise/publishing/campaigns');

    render(
      <PublishingLayoutContent>
        <div>campaign desk</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('campaign desk')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new content/i }),
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
      screen.queryByRole('button', { name: /new content/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('container')).not.toBeInTheDocument();
  });

  it('renders list actions with a status dropdown', () => {
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new content/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new content/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All statuses' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Publishing status' }),
    ).not.toBeInTheDocument();
  });

  it('shows legacy published deep links in the status dropdown', () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('status=public&platform=youtube'),
    );
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );
    expect(
      screen.getByRole('button', { name: 'Published' }),
    ).toBeInTheDocument();
  });

  it('combines statuses while preserving other filters and resetting pagination', async () => {
    const replace = vi.fn();
    useRouterMock.mockReturnValue({ refresh: vi.fn(), replace });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube&page=3&executionState=scheduled'),
    );
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    await user.click(screen.getByText('Failed', { exact: true }));
    expect(replace).toHaveBeenCalledWith(
      '/publishing/posts?platform=youtube&executionState=scheduled&executionState=failed',
    );
  });

  it('seeds the agent composer without leaving Publishing', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    // The New content menu is a pointer-driven dropdown, so fireEvent.click on
    // the trigger never opens it — drive it through userEvent.
    await user.click(screen.getByRole('button', { name: /new content/i }));
    await user.click(screen.getByRole('button', { name: /post with agent/i }));

    expect(openAgentComposerMock).toHaveBeenCalledTimes(1);
    expect(openAgentComposerMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /generate a new post for my brand "Acme Creator".*do not ask which brand/i,
      ),
    );
  });

  it('keeps the prompt well-formed when the brand label contains a quote', async () => {
    brandMock.label = 'The "Real" Deal';
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    await user.click(screen.getByRole('button', { name: /new content/i }));
    await user.click(screen.getByRole('button', { name: /post with agent/i }));

    const prompt = openAgentComposerMock.mock.calls[0][0] as string;
    expect(prompt).toContain(
      'my brand "The \\"Real\\" Deal" (already selected',
    );
    expect(prompt).toContain('do not ask which brand to use)');
  });

  it('opens first-class X long-form and thread composers', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>child content</div>
      </PublishingLayoutContent>,
    );

    await user.click(
      await screen.findByRole('button', { name: /new content/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /x long post/i }),
    );
    expect(openModalMock).toHaveBeenCalledWith('modal-post-long-form');

    // openModal is mocked, so no modal takes over and the menu stays open —
    // it marks the rest of the page aria-hidden, which would hide the trigger
    // from the next query. Dismiss it before reopening.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.body).not.toHaveAttribute('data-scroll-locked');
    });

    await user.click(
      await screen.findByRole('button', { name: /new content/i }),
    );
    await user.click(await screen.findByRole('button', { name: /x thread/i }));
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
      screen.queryByRole('button', { name: /new content/i }),
    ).not.toBeInTheDocument();
  });
});
