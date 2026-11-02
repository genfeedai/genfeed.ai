'use client';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  createArtifactEditorRoute,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import {
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Article } from '@models/content/article.model';
import type {
  TableColumn,
  TableRowLink,
  TableRowSidebar,
} from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Newspaper, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import { LazyModalArticle } from '@/components/lazy/modal/LazyModal';
import ArticleTrafficPanel from '@/features/articles/analytics/article-traffic-panel';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

interface ArticlesListProps {
  status?: string;
}

const ARTICLE_SORT_KEYS = ['label', 'status', 'createdAt'] as const;
const ARTICLES_LIST_KEY = ['articles', 'list'] as const;
const EMPTY_ARTICLES: Article[] = [];

function openCreateArticleModal(): void {
  openModal(ModalEnum.ARTICLE);
}

export default function ArticlesList({ status = 'draft' }: ArticlesListProps) {
  const translate = useTranslations('pages.articles.list');
  const { brandId, organizationId } = useCollectionScope();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams?.get('page')) || 1;
  const { sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: ARTICLE_SORT_KEYS,
  });

  const queryClient = useQueryClient();

  const columns: TableColumn<Article>[] = [
    { header: translate('title'), key: 'label', sortable: true },
    {
      header: translate('author'),
      key: 'author',
      render: (article: Article) => article.author || '-',
    },
    {
      header: translate('status'),
      key: 'status',
      sortable: true,
      render: (article: Article) => (
        <Badge status={article.status || status}>
          {capitalize(article.status || status)}
        </Badge>
      ),
    },
    {
      header: translate('words'),
      key: 'wordCount',
      render: (article: Article) =>
        article.wordCount ? String(article.wordCount) : '-',
    },
    {
      header: translate('created'),
      key: 'createdAt',
      sortable: true,
      render: (article: Article) => <TableDateCell value={article.createdAt} />,
    },
  ];

  // Cached per scope, status, page and sort: coming back to Articles paints the
  // rows it already has while it refreshes, paging keeps the current rows on
  // screen, and a failed refresh keeps the loaded rows under its error.
  const scopeKey = { brandId, organizationId, status };
  const articlesQuery = usePagedAuthedQuery({
    enabled: Boolean(organizationId),
    keepPreviousDataWithin: [...ARTICLES_LIST_KEY, scopeKey],
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        ...toBrandListParams({ brandId }),
        limit: ITEMS_PER_PAGE,
        organizationId,
        page: currentPage,
        status,
        ...(sortKey ? { sortBy: sortKey, sortOrder: sortDirection } : {}),
      };
      try {
        return await service.findAll(query, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /articles failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...ARTICLES_LIST_KEY,
      scopeKey,
      { page: currentPage, sortDirection, sortKey },
    ],
    service: (token: string) => ArticlesService.getInstance(token),
  });
  const { errorUpdatedAt, isError, isPending, refetch } = articlesQuery;
  const articles = articlesQuery.data?.items ?? EMPTY_ARTICLES;
  const reloadArticles = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      NotificationsService.getInstance().error(translate('loadError'));
    }
  }, [errorUpdatedAt, isError, translate]);

  /** Refinement belongs to the artifact — open the article's own editor page. */
  function getRowLink(article: Article): TableRowLink {
    return {
      href: href(createArtifactEditorRoute('article', article.id)),
      label: translate('open', { label: article.label }),
    };
  }

  /** Row click: the article and its website traffic in the right sidebar. */
  const rowSidebar: TableRowSidebar<Article> = {
    getId: (article) => article.id,
    getSubtitle: (article) => article.author || undefined,
    getTitle: (article) => article.label,
    kind: 'post',
    render: (article) => (
      <ArticleTrafficPanel
        key={`${organizationId}:${brandId}:${article.id}`}
        article={article}
        openHref={getRowLink(article).href}
        openLabel={getRowLink(article).label}
      />
    ),
  };

  function handleArticleCreated(): void {
    // Every cached status and page may now list the new article.
    void queryClient.invalidateQueries({ queryKey: ARTICLES_LIST_KEY });
  }

  return (
    <>
      {articles.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            ariaLabel={translate('create')}
            icon={<Plus className="size-4" />}
            label={translate('create')}
            onClick={openCreateArticleModal}
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      ) : null}

      <AppTable<Article>
        error={
          isError
            ? {
                title: translate('loadError'),
                onRetry: reloadArticles,
              }
            : undefined
        }
        items={articles}
        columns={columns}
        isLoading={isPending}
        getRowKey={(item) => item.id}
        getRowLink={getRowLink}
        rowSidebar={rowSidebar}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyLabel={translate('emptyLabel')}
        emptyState={
          <EmptyState
            icon={Newspaper}
            title={translate('emptyTitle')}
            action={{
              label: translate('create'),
              onClick: openCreateArticleModal,
            }}
          />
        }
      />

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel={translate('totalLabel')}
          totals={articlesQuery.data?.totals}
        />
      </div>

      <LazyModalArticle onConfirm={handleArticleCreated} />
    </>
  );
}
