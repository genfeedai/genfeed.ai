'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  createArtifactEditorRoute,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Article } from '@models/content/article.model';
import type { TableColumn, TableRowLink } from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { LazyModalArticle } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Newspaper, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ArticlesListProps {
  status?: string;
}

function openCreateArticleModal(): void {
  openModal(ModalEnum.ARTICLE);
}

export default function ArticlesList({ status = 'draft' }: ArticlesListProps) {
  const { brandId, organizationId } = useCollectionScope();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams?.get('page')) || 1;

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const requestId = useRef(0);

  const columns: TableColumn<Article>[] = [
    { header: 'Title', key: 'label' },
    {
      header: 'Author',
      key: 'author',
      render: (article: Article) => article.author || '-',
    },
    {
      header: 'Status',
      key: 'status',
      render: (article: Article) => (
        <Badge status={article.status || status}>
          {capitalize(article.status || status)}
        </Badge>
      ),
    },
    {
      header: 'Words',
      key: 'wordCount',
      render: (article: Article) =>
        article.wordCount ? String(article.wordCount) : '-',
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (article: Article) =>
        article.createdAt ? formatDate(article.createdAt) : '-',
    },
  ];

  const findAllArticles = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setIsError(false);

    try {
      const service = await getArticlesService();
      const query: IQueryParams = {
        ...toBrandListParams({ brandId }),
        limit: ITEMS_PER_PAGE,
        organizationId: organizationId,
        page: currentPage,
        status,
      };

      const data = await service.findAll(query);
      if (currentRequest !== requestId.current) return;
      setArticles(data);
      logger.info('GET /articles success', data);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setIsError(true);
      logger.error('GET /articles failed', error);
      NotificationsService.getInstance().error('Failed to load articles');
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [currentPage, getArticlesService, brandId, organizationId, status]);

  useEffect(() => {
    void findAllArticles();
    return () => {
      requestId.current += 1;
    };
  }, [findAllArticles]);

  /** Refinement belongs to the artifact — open the article's own editor page. */
  function getRowLink(article: Article): TableRowLink {
    return {
      href: href(createArtifactEditorRoute('article', article.id)),
      label: `Open ${article.label}`,
    };
  }

  function handleArticleCreated(): void {
    findAllArticles();
  }

  return (
    <>
      {articles.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            ariaLabel="Create Article"
            icon={<Plus className="size-4" />}
            label="Create Article"
            onClick={openCreateArticleModal}
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      ) : null}

      <AppTable<Article>
        error={
          isError
            ? {
                title: 'Failed to load articles',
                onRetry: () => findAllArticles(),
              }
            : undefined
        }
        items={articles}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        getRowLink={getRowLink}
        emptyLabel="No articles found"
        emptyState={
          <CardEmptyContent
            icon={Newspaper}
            label="No articles yet"
            description="Create your first article to start building your content library."
            action={{
              label: 'Create Article',
              onClick: openCreateArticleModal,
            }}
          />
        }
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="articles" />
      </div>

      <LazyModalArticle onConfirm={handleArticleCreated} />
    </>
  );
}
