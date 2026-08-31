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
    usePathnameMock.mockReturnValue('/publishing/scheduled');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube'),
    );
  });

  it('renders list actions without route-level status tabs', () => {
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
      screen.queryByRole('link', { name: /drafts/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /scheduled/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /published/i }),
    ).not.toBeInTheDocument();
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
