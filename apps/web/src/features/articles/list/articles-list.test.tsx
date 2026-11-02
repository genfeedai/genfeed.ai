import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import type { Article } from '@models/content/article.model';
import type { QueryClient } from '@tanstack/react-query';
import {
  act,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import type { PropsWithChildren, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticlesList from '@/features/articles/list/articles-list';
import '@testing-library/jest-dom/vitest';

const pagesMessages = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../messages/en/pages/articles.json',
    ),
    'utf8',
  ),
);
function IntlWrapper({ children }: PropsWithChildren) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ pages: { articles: pagesMessages } }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
function render(ui: ReactElement, client?: QueryClient) {
  const QueryWrapper = queryClientWrapper(client);
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryWrapper>
        <IntlWrapper>{children}</IntlWrapper>
      </QueryWrapper>
    );
  }
  return rtlRender(ui, { wrapper: Wrapper });
}

const mockFindAll = vi.fn();
const mockGetWebsiteTraffic = vi.fn();

const getArticlesServiceMock = async () => ({
  findAll: mockFindAll,
  getWebsiteTraffic: mockGetWebsiteTraffic,
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getArticlesServiceMock,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (route: string) => route,
  }),
}));

vi.mock('@services/content/articles.service', () => ({
  ArticlesService: {
    getInstance: () => ({
      findAll: mockFindAll,
    }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: vi.fn(() => ({
      openConfirm: vi.fn(),
    })),
  }),
);

vi.mock('next/dynamic', () => ({
  default: () => () => <div>Daily traffic chart</div>,
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    brandSlug: 'brand-slug',
    orgSlug: 'org-slug',
  })),
  usePathname: vi.fn(() => '/org-slug/brand-slug/articles'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
    toString: vi.fn(() => ''),
  })),
}));

vi.mock('@/components/lazy/modal/LazyModal', async () => {
  const React = await import('react');
  const { ModalEnum: ArticleModalEnum } = await import('@genfeedai/contracts');
  const { isModalOpen, subscribeModal } = await import(
    '@helpers/ui/modal/modal.helper'
  );

  return {
    LazyModalArticle: function LazyModalArticleMock({
      onConfirm,
    }: {
      onConfirm: () => void;
    }) {
      const isOpen = React.useSyncExternalStore(
        (listener) => subscribeModal(ArticleModalEnum.ARTICLE, listener),
        () => isModalOpen(ArticleModalEnum.ARTICLE),
        () => false,
      );

      if (!isOpen) {
        return null;
      }

      return (
        <div>
          Create New Article
          <button onClick={onConfirm} type="button">
            Confirm new article
          </button>
        </div>
      );
    },
  };
});

function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    author: 'vincent',
    createdAt: '2026-08-01T00:00:00.000Z',
    id: 'article-1',
    label: 'My Draft',
    status: 'draft',
    wordCount: 120,
    ...overrides,
  } as Article;
}

const here = dirname(fileURLToPath(import.meta.url));

function readNearbySource(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('ArticlesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeModal(ModalEnum.ARTICLE);
    mockFindAll.mockResolvedValue([]);
    vi.mocked(useSearchParams).mockReturnValue({
      get: () => null,
      toString: () => '',
    } as unknown as ReturnType<typeof useSearchParams>);
  });

  it('shows the skeleton, not the empty state, while the first read is in flight', () => {
    mockFindAll.mockReturnValue(new Promise(() => {}));

    render(<ArticlesList />);

    expect(screen.queryByText('No articles yet')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Article' }),
    ).not.toBeInTheDocument();
  });

  it('paints the cached articles at once when coming back while it revalidates', async () => {
    mockFindAll.mockResolvedValue([buildArticle()]);
    const client = createTestQueryClient();
    const firstVisit = render(<ArticlesList />, client);
    expect(await screen.findByText('My Draft')).toBeInTheDocument();
    firstVisit.unmount();

    mockFindAll.mockReturnValue(new Promise(() => {}));
    render(<ArticlesList />, client);

    expect(screen.getByText('My Draft')).toBeInTheDocument();
  });

  it('keeps the loaded rows under the error when a refresh fails, until its retry settles', async () => {
    const user = userEvent.setup();
    mockFindAll.mockResolvedValueOnce([buildArticle()]);
    render(<ArticlesList />);
    await screen.findByText('My Draft');

    mockFindAll.mockRejectedValueOnce(new Error('Refresh failed'));
    await user.click(screen.getByRole('button', { name: 'Create Article' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm new article' }),
    );
    await screen.findByText('Failed to load articles');
    expect(screen.getByText('My Draft')).toBeInTheDocument();

    let resolveRetry: (articles: Article[]) => void = () => {};
    mockFindAll.mockImplementationOnce(
      () =>
        new Promise<Article[]>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('My Draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    await act(async () =>
      resolveRetry([buildArticle({ label: 'Updated draft' })]),
    );
    await screen.findByText('Updated draft');
    expect(
      screen.queryByText('Failed to load articles'),
    ).not.toBeInTheDocument();
  });

  it('opens the article and its traffic in the right sidebar while the title links to the editor', async () => {
    const user = userEvent.setup();
    mockFindAll.mockResolvedValue([buildArticle()]);
    mockGetWebsiteTraffic.mockResolvedValue({
      articleId: 'article-1',
      days: [],
      period: '30d',
      reason: null,
      status: 'available',
      totalResourceClicks: 3,
      totalViews: 42,
    });

    render(
      <ContextSidebarProvider>
        <ArticlesList />
        <ContextSidebarOutlet testId="rail" />
      </ContextSidebarProvider>,
    );

    const titleLink = await screen.findByRole('link', {
      name: 'Open My Draft',
    });
    expect(titleLink.getAttribute('href')).toContain('article-1');
    expect(screen.queryByTestId('article-traffic-panel')).toBeNull();

    await user.click(screen.getByText('vincent'));

    const panel = await screen.findByTestId('article-traffic-panel');
    expect(screen.getByTestId('rail')).toContainElement(panel);
    await screen.findByText('Website views');
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(mockGetWebsiteTraffic).toHaveBeenCalledWith(
      'article-1',
      '30d',
      expect.any(AbortSignal),
    );
  });

  it('should render without crashing', async () => {
    const { container } = render(<ArticlesList />);

    await waitFor(() => {
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  it.each([
    ['label', { sortBy: 'label', sortOrder: 'asc' }],
    ['-status', { sortBy: 'status', sortOrder: 'desc' }],
    ['createdAt', { sortBy: 'createdAt', sortOrder: 'asc' }],
  ])(
    'asks the server to order articles by the %s URL sort',
    async (urlSort, expected) => {
      vi.mocked(useSearchParams).mockReturnValue({
        get: (key: string) => (key === 'sort' ? urlSort : null),
        toString: () => `sort=${urlSort}`,
      } as unknown as ReturnType<typeof useSearchParams>);

      render(<ArticlesList />);

      await waitFor(() => {
        expect(mockFindAll).toHaveBeenLastCalledWith(
          expect.objectContaining(expected),
          expect.any(AbortSignal),
        );
      });
    },
  );

  it.each(['wordCount', '-author', ''])(
    'does not send the unsortable URL sort %j',
    async (urlSort) => {
      vi.mocked(useSearchParams).mockReturnValue({
        get: (key: string) => (key === 'sort' ? urlSort : null),
        toString: () => `sort=${urlSort}`,
      } as unknown as ReturnType<typeof useSearchParams>);

      render(<ArticlesList />);

      await waitFor(() => {
        expect(mockFindAll).toHaveBeenCalled();
      });
      expect(mockFindAll).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ sortBy: expect.anything() }),
        expect.any(AbortSignal),
      );
    },
  );

  it('opens the create-article modal from the empty-state Create action', async () => {
    const user = userEvent.setup();
    mockFindAll.mockResolvedValue([]);

    render(<ArticlesList />);

    await waitFor(() => {
      expect(screen.getByText('No articles yet')).toBeInTheDocument();
    });

    expect(screen.queryByText('Create New Article')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Article' }));

    expect(screen.getByText('Create New Article')).toBeInTheDocument();
  });

  it('exposes Create when the list is populated and opens the same modal', async () => {
    const user = userEvent.setup();
    mockFindAll.mockResolvedValue([buildArticle()]);

    render(<ArticlesList />);

    await waitFor(() => {
      expect(screen.getByText('My Draft')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: 'Create Article' });
    expect(createButton).toBeInTheDocument();
    expect(screen.queryByText('No articles yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Create New Article')).not.toBeInTheDocument();

    await user.click(createButton);

    expect(screen.getByText('Create New Article')).toBeInTheDocument();
  });
});

describe('article create modal id contract', () => {
  it('fails when the list opener and ModalArticle listen on different ids', () => {
    const listSource = readNearbySource('articles-list.tsx');
    const modalSource = readNearbySource(
      '../../../components/modals/content/article/ModalArticle.tsx',
    );

    const openedIds = [
      ...listSource.matchAll(/openModal\((ModalEnum\.[A-Z0-9_]+)\)/g),
    ].map((match) => match[1]);
    const listenedIds = [
      ...modalSource.matchAll(/\bid=\{(ModalEnum\.[A-Z0-9_]+)\}/g),
    ].map((match) => match[1]);

    expect(openedIds.length).toBeGreaterThan(0);
    expect(listenedIds).toEqual(['ModalEnum.ARTICLE']);
    expect(new Set(openedIds)).toEqual(new Set(['ModalEnum.ARTICLE']));
    expect(listSource).not.toContain('ARTICLE_GENERATE');
    expect(modalSource).not.toContain('ARTICLE_GENERATE');
  });
});
