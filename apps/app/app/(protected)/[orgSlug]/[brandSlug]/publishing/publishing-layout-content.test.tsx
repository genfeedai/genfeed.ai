import '@testing-library/jest-dom/vitest';
import type {
  ModalArticleProps,
  ModalNewsletterProps,
  ModalPostProps,
} from '@props/modals/modal.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishingLayoutContent from './publishing-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();
const modalCallbacks = vi.hoisted(() => ({
  articleMount: vi.fn(),
  article: undefined as ModalArticleProps['onCreated'],
  newsletter: undefined as ModalNewsletterProps['onCreated'] | undefined,
  post: undefined as ModalPostProps | undefined,
}));
const openModalMock = vi.fn();
const pushMock = vi.fn();
const hrefMock = vi.fn((path: string) => `/acme/main${path}`);

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
  LazyModalArticle: (props: ModalArticleProps) => {
    modalCallbacks.articleMount();
    modalCallbacks.article = props.onCreated;
    return null;
  },
  LazyModalNewsletter: (props: ModalNewsletterProps) => {
    modalCallbacks.newsletter = props.onCreated;
    return null;
  },
  LazyModalPost: (props: ModalPostProps) => {
    modalCallbacks.post = props;
    return null;
  },
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

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: hrefMock }),
}));

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('PublishingLayoutContent', () => {
  beforeEach(() => {
    modalCallbacks.articleMount.mockClear();
    brandMock.label = 'Acme Creator';
    brandMock.credentials = [];
    modalCallbacks.post = undefined;
    openModalMock.mockReset();
    pushMock.mockReset();
    hrefMock.mockClear();
    usePathnameMock.mockReturnValue('/publishing/posts');
    useRouterMock.mockReturnValue({ push: pushMock, refresh: vi.fn() });
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

  it.each([
    '/acme/moonrise/publishing/campaigns/campaign-1/calendar',
    '/acme/~/publishing/campaigns/campaign-1/calendar',
  ])('leaves modal ownership to the campaign calendar at %s', (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    render(
      <PublishingLayoutContent>
        <div>calendar</div>
      </PublishingLayoutContent>,
    );
    expect(modalCallbacks.articleMount).not.toHaveBeenCalled();
  });

  it('renders one New post button and leaves filters to the posts list', () => {
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

  it('opens the unified composer without a format menu', async () => {
    const user = userEvent.setup();
    render(
      <PublishingLayoutContent>
        <div>posts</div>
      </PublishingLayoutContent>,
    );

    await user.click(screen.getByRole('button', { name: /new post/i }));

    expect(openModalMock).toHaveBeenCalledTimes(1);
    expect(openModalMock).toHaveBeenCalledWith('modal-post-compose');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('mounts the composer with every connected account as a destination', () => {
    brandMock.credentials = [
      { id: 'cred-x', platform: 'twitter' },
      { id: 'cred-li', platform: 'linkedin' },
    ];
    render(
      <PublishingLayoutContent>
        <div>posts</div>
      </PublishingLayoutContent>,
    );

    expect(modalCallbacks.post?.isComposer).toBe(true);
    expect(modalCallbacks.post?.modalId).toBe('modal-post-compose');
    expect(modalCallbacks.post?.credentials?.map((c) => c.id)).toEqual([
      'cred-x',
      'cred-li',
    ]);
  });

  it('routes article and newsletter creation to their editors', () => {
    render(
      <PublishingLayoutContent>
        <div>posts</div>
      </PublishingLayoutContent>,
    );

    modalCallbacks.article?.(['article-1', 'article-2']);
    expect(pushMock).toHaveBeenLastCalledWith(
      '/acme/main/publishing/posts/article-1',
    );
    modalCallbacks.newsletter?.('newsletter-1');
    expect(pushMock).toHaveBeenLastCalledWith(
      '/acme/main/edit/newsletter/newsletter-1',
    );
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
