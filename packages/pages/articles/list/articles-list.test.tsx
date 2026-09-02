import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import type { Article } from '@models/content/article.model';
import ArticlesList from '@pages/articles/list/articles-list';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockFindAll = vi.fn();

const getArticlesServiceMock = async () => ({
  findAll: mockFindAll,
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  }),
}));

// The fetch effect depends on the service getter's identity, so it must be
// stable across renders or the list refetches forever.
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

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
  })),
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

vi.mock('@ui/lazy/modal/LazyModal', async () => {
  const React = await import('react');
  const { ModalEnum: ArticleModalEnum } = await import('@genfeedai/contracts');
  const { isModalOpen, subscribeModal } = await import(
    '@helpers/ui/modal/modal.helper'
  );

  return {
    LazyModalArticle: function LazyModalArticleMock() {
      const isOpen = React.useSyncExternalStore(
        (listener) => subscribeModal(ArticleModalEnum.ARTICLE, listener),
        () => isModalOpen(ArticleModalEnum.ARTICLE),
        () => false,
      );

      if (!isOpen) {
        return null;
      }

      return <div>Create New Article</div>;
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
  });

  it('should render without crashing', async () => {
    const { container } = render(<ArticlesList />);

    await waitFor(() => {
      expect(container.firstChild).toBeInTheDocument();
    });
  });

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
      '../../../ui/src/components/modals/content/article/ModalArticle.tsx',
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
