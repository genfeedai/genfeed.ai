'use client';

import type { IQueryParams } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Article } from '@models/content/article.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { LazyModalArticle } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineNewspaper } from 'react-icons/hi2';

interface ArticlesListProps {
  status?: string;
}

export default function ArticlesList({ status = 'draft' }: ArticlesListProps) {
  const notificationsService = NotificationsService.getInstance();
  const { brandId, organizationId } = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams?.get('page')) || 1;

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

    setIsLoading(true);

    try {
      const service = await getArticlesService();
      const query: IQueryParams = {
        brand: brandId,
        limit: ITEMS_PER_PAGE,
        organization: organizationId,
        page: currentPage,
        status,
      };

      const data = await service.findAll(query);
      setArticles(data);
      logger.info('GET /articles success', data);
    } catch (error) {
      logger.error('GET /articles failed', error);
      notificationsService.error('Failed to load articles');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    getArticlesService,
    notificationsService,
    brandId,
    organizationId,
    status,
  ]);

  useEffect(() => {
    findAllArticles();
  }, [findAllArticles]);

  function handleRowClick(article: Article): void {
    router.push(`${COMPOSE_ROUTES.ARTICLE}?id=${article.id}`);
  }

  function handleArticleCreated(): void {
    findAllArticles();
  }

  return (
    <>
      <AppTable<Article>
        items={articles}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        onRowClick={handleRowClick}
        emptyLabel="No articles found"
        emptyState={
          <CardEmpty
            icon={HiOutlineNewspaper}
            label="No articles yet"
            description="Create your first article to start building your content library."
            action={{
              label: 'Create Article',
              onClick: () => openModal(ModalEnum.ARTICLE_GENERATE),
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
