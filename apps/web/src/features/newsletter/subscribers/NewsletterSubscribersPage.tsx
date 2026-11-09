'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  BRAND_SUBSCRIBER_SOURCES,
  BRAND_SUBSCRIBER_STATUSES,
  isBrandSubscriberStatus,
} from '@genfeedai/contracts/constants';
import type { IBrandSubscriberImportSummary } from '@genfeedai/contracts/interfaces';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableColumn } from '@props/ui/display/table.props';
import type { BrandSubscriberRecord } from '@services/content/newsletter-module.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Download,
  MailCheck,
  MailPlus,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import {
  NEWSLETTER_QUERY_KEY,
  useNewsletterService,
  useNewsletterSubscriberStats,
  useNewsletterSubscribers,
  useNewsletterUsage,
} from '@/features/newsletter/hooks/use-newsletter-module';
import NewsletterBrandGate from '@/features/newsletter/NewsletterBrandGate';
import {
  downloadNewsletterCsv,
  newsletterExportFilename,
} from '@/features/newsletter/newsletter-csv.util';
import NewsletterAddSubscribersDialog from '@/features/newsletter/subscribers/NewsletterAddSubscribersDialog';
import NewsletterImportDialog from '@/features/newsletter/subscribers/NewsletterImportDialog';

const SOURCE_KEYS = new Set<string>(BRAND_SUBSCRIBER_SOURCES);

/** A brand's newsletter audience (#9724): stats, list, add, import, export. */
export default function NewsletterSubscribersPage() {
  const translate = useTranslations('pages.publishing.newsletter');
  const { brandId } = useCollectionScope();
  const { selectedBrand } = useBrand();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const getService = useNewsletterService();
  const { search, setSearch } = useAdminSearchParam();
  const rawStatus = searchParams?.get('status') ?? null;
  const status = isBrandSubscriberStatus(rawStatus) ? rawStatus : null;
  const parsedPage = Number.parseInt(searchParams?.get('page') ?? '1', 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const [dialog, setDialog] = useState<'add' | 'import' | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const subscribers = useNewsletterSubscribers(brandId, {
    page,
    search,
    status,
  });
  const stats = useNewsletterSubscriberStats(brandId);
  const usage = useNewsletterUsage(brandId);
  const data = subscribers.data;

  const statusOptions = useMemo(
    () => [
      { label: translate('status.all'), value: 'all' },
      ...BRAND_SUBSCRIBER_STATUSES.map((value) => ({
        label: translate(`status.${value}`),
        value,
      })),
    ],
    [translate],
  );

  const columns = useMemo(
    (): TableColumn<BrandSubscriberRecord>[] => [
      {
        header: translate('subscribers.columns.email'),
        key: 'email',
        subtext: (subscriber) => subscriber.name ?? undefined,
      },
      {
        header: translate('subscribers.columns.status'),
        key: 'status',
        render: (subscriber) => (
          <Badge status={subscriber.status}>
            {translate(`status.${subscriber.status}`)}
          </Badge>
        ),
      },
      {
        header: translate('subscribers.columns.source'),
        key: 'source',
        render: (subscriber) =>
          SOURCE_KEYS.has(subscriber.source)
            ? translate(`source.${subscriber.source}`)
            : subscriber.source,
      },
      {
        header: translate('subscribers.columns.tags'),
        key: 'tags',
        render: (subscriber) =>
          subscriber.tags.length > 0 ? subscriber.tags.join(', ') : '—',
      },
      {
        header: translate('subscribers.columns.added'),
        key: 'createdAt',
        render: (subscriber) => (
          <TableDateCell hasTime={false} value={subscriber.createdAt} />
        ),
      },
    ],
    [translate],
  );

  async function refreshAll(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: [NEWSLETTER_QUERY_KEY] });
  }

  function replaceParams(update: (params: URLSearchParams) => void): void {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    update(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? ''), {
      scroll: false,
    });
  }

  function replaceStatus(next: string): void {
    replaceParams((params) => {
      if (next === 'all') params.delete('status');
      else params.set('status', next);
      params.delete('page');
    });
  }

  function replacePage(next: number): void {
    replaceParams((params) => {
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
    });
  }

  async function handleExport(): Promise<void> {
    if (!brandId) return;
    setIsExporting(true);
    try {
      const service = await getService();
      if (!service) return;
      const csv = await service.exportSubscribers(brandId);
      downloadNewsletterCsv(
        csv,
        newsletterExportFilename(selectedBrand?.slug ?? '', new Date()),
      );
    } catch (error) {
      logger.error('Newsletter subscriber export failed', error);
      NotificationsService.getInstance().error(
        translate('subscribers.exportFailed'),
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleRemove(
    subscriber: BrandSubscriberRecord,
  ): Promise<void> {
    if (!brandId) return;
    try {
      const service = await getService();
      await service?.removeSubscriber(brandId, subscriber.id);
      NotificationsService.getInstance().success(
        translate('subscribers.removed', { email: subscriber.email }),
      );
      await refreshAll();
    } catch (error) {
      logger.error('Newsletter subscriber remove failed', error);
      NotificationsService.getInstance().error(
        translate('subscribers.removeFailed'),
      );
    }
  }

  async function handleResend(
    subscriber: BrandSubscriberRecord,
  ): Promise<void> {
    if (!brandId) return;
    try {
      const service = await getService();
      await service?.resendConfirmation(brandId, subscriber.id);
      NotificationsService.getInstance().success(
        translate('subscribers.confirmationSent', { email: subscriber.email }),
      );
    } catch (error) {
      logger.error('Newsletter confirmation resend failed', error);
      NotificationsService.getInstance().error(
        translate('subscribers.resendFailed'),
      );
    }
  }

  function handleDone(summary: IBrandSubscriberImportSummary): void {
    setDialog(null);
    NotificationsService.getInstance().success(
      translate('subscribers.summary.toast', {
        added: summary.added,
        skipped: summary.duplicate + summary.invalid + summary.suppressed,
      }),
    );
    void refreshAll();
  }

  if (!brandId) {
    return (
      <Container icon={MailCheck} label={translate('subscribers.title')}>
        <NewsletterBrandGate title={translate('subscribers.title')} />
      </Container>
    );
  }

  const usageValue = usage.data
    ? usage.data.subscriberLimit === null
      ? translate('usage.unlimited')
      : translate('usage.ofLimit', {
          count: usage.data.subscribers,
          limit: usage.data.subscriberLimit,
        })
    : '—';

  return (
    <Container
      icon={MailCheck}
      label={translate('subscribers.title')}
      titleVisibility="sr-only"
      leading={
        <SearchField
          ariaLabel={translate('subscribers.search')}
          onSearch={setSearch}
          placeholder={translate('subscribers.search')}
          value={search}
        >
          <FilterMenu
            facets={[
              {
                defaultValue: 'all',
                key: 'status',
                label: translate('subscribers.columns.status'),
                onChange: replaceStatus,
                options: statusOptions,
                selection: 'single',
                value: status ?? 'all',
              },
            ]}
            isAttached
            onClear={() => replaceStatus('all')}
          />
        </SearchField>
      }
      refresh={
        <ButtonRefresh
          isRefreshing={subscribers.isFetching}
          onClick={() => void refreshAll()}
        />
      }
      right={
        <SubbarControls
          secondaryActions={
            <>
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <NextLink
                  href={href(APP_ROUTES.PUBLISHING.NEWSLETTER_SETTINGS)}
                >
                  <Settings2 className="size-4" />
                  {translate('subscribers.settings')}
                </NextLink>
              </Button>
              <Button
                icon={<Upload className="size-4" />}
                label={translate('subscribers.import')}
                onClick={() => setDialog('import')}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
              <Button
                icon={<Download className="size-4" />}
                isLoading={isExporting}
                label={translate('subscribers.export')}
                onClick={() => void handleExport()}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </>
          }
          primaryAction={
            <Button
              icon={<MailPlus className="size-4" />}
              label={translate('subscribers.add')}
              onClick={() => setDialog('add')}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          }
        />
      }
    >
      <KPISection
        gridCols={{ desktop: 4, mobile: 2 }}
        isLoading={stats.isLoading}
        items={[
          {
            label: translate('subscribers.stats.active'),
            value: stats.data?.active ?? 0,
          },
          {
            label: translate('subscribers.stats.pending'),
            value: stats.data?.pending ?? 0,
          },
          {
            label: translate('subscribers.stats.unsubscribed'),
            value: stats.data?.unsubscribed ?? 0,
          },
          {
            label: translate('subscribers.stats.plan'),
            value: usageValue,
          },
        ]}
        size="sm"
      />
      <AppTable<BrandSubscriberRecord>
        actions={[
          {
            ariaLabel: (subscriber) =>
              translate('subscribers.resendFor', { email: subscriber.email }),
            icon: <MailPlus className="size-4" />,
            isVisible: (subscriber) => subscriber.status === 'pending',
            onClick: (subscriber) => void handleResend(subscriber),
            tooltip: translate('subscribers.resend'),
          },
          {
            ariaLabel: (subscriber) =>
              translate('subscribers.removeFor', { email: subscriber.email }),
            icon: <Trash2 className="size-4" />,
            onClick: (subscriber) => void handleRemove(subscriber),
            tone: 'destructive',
            tooltip: translate('subscribers.remove'),
          },
        ]}
        columns={columns}
        emptyLabel={
          search || status
            ? translate('subscribers.emptyFiltered')
            : translate('subscribers.empty')
        }
        error={
          subscribers.isError
            ? {
                onRetry: () => void subscribers.refetch(),
                title: translate('subscribers.loadError'),
              }
            : undefined
        }
        getRowKey={(subscriber) => subscriber.id}
        isLoading={subscribers.isLoading}
        items={data?.items ?? []}
      />
      <div className="mt-4">
        <Pagination
          currentPage={page}
          onPageChange={replacePage}
          totalItems={data?.total ?? 0}
          totalLabel="subscribers"
          totalPages={data?.totalPages ?? 1}
        />
      </div>
      {dialog === 'add' ? (
        <NewsletterAddSubscribersDialog
          brandId={brandId}
          onClose={() => setDialog(null)}
          onDone={handleDone}
        />
      ) : null}
      {dialog === 'import' ? (
        <NewsletterImportDialog
          brandId={brandId}
          onClose={() => setDialog(null)}
          onDone={handleDone}
        />
      ) : null}
    </Container>
  );
}
