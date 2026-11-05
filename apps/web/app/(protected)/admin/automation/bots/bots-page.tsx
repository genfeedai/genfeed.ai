'use client';
import {
  BotStatus,
  ComponentSize,
  formatEnumLabel,
} from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { Bot } from '@models/automation/bot.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { BotsService } from '@services/automation/bots.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Bot as BotIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminScopeFilter from '@/components/content/admin-filters/AdminScopeFilter';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

// `bots.status` is the Prisma `BotStatus` enum — SCREAMING_SNAKE on the wire.
// Every member is mapped explicitly: STOPPED is a deliberate terminal state, so
// leaving it to the `error` default painted a normally-stopped bot as broken.
// `secondary` is the deliberate-stop treatment for a normally stopped bot.
function getBotStatusVariant(
  status: string,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case BotStatus.ACTIVE:
      return 'success';
    case BotStatus.PAUSED:
      return 'warning';
    case BotStatus.STOPPED:
      return 'secondary';
    default:
      return 'destructive';
  }
}

const EMPTY_BOTS: Bot[] = [];
// Bot columns the list endpoint can order by; the rest are JSON or computed.
const BOT_SORT_KEYS = ['label', 'status', 'category'] as const;
const DEFAULT_BOT_SORT = 'createdAt: -1';
const EMPTY_VALUE = '—';

/**
 * Every organization's bots, in the shared admin table. Without an
 * organization filter the API lists the operator's own bots.
 */
export default function BotsPage() {
  const notificationsService = NotificationsService.getInstance();
  const translate = useTranslations('pages.adminBots');
  const searchT = useTranslations('common.adminSearch');

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { search, setSearch } = useAdminSearchParam();
  const { brand, organization } = useAdminOrgBrandParams();
  // The list pages on the server, so it sorts there too.
  const { onSortChange, sort, sortDirection, sortKey } = useTableSort({
    allowedKeys: BOT_SORT_KEYS,
  });
  const scopeKey = { brand, organization };

  // Cached per scope, page, search and sort: coming back to Bots paints the
  // rows it already has while it refreshes, and paging keeps the current rows
  // on screen. Another organization or brand never shows this one's rows.
  const botsQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: ['admin', 'bots', scopeKey],
    queryFn: async (service, signal) => {
      try {
        const fetchedBots = await service.findAllPage(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(organization ? { organizationId: organization } : {}),
            ...(brand ? { brandId: brand } : {}),
            ...(search ? { search } : {}),
            sort: sort ?? DEFAULT_BOT_SORT,
          },
          signal,
        );
        logger.info('Loaded bots', { count: fetchedBots.items.length });
        return fetchedBots;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load bots', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'bots', scopeKey, { page: currentPage, search, sort }],
    service: (token: string) => BotsService.getInstance(token),
  });
  const bots = botsQuery.data?.items ?? EMPTY_BOTS;
  const { isLoading, refetch } = botsQuery;
  const isRefreshing = botsQuery.isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  const { errorUpdatedAt, isError } = botsQuery;
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error(translate('loadError'));
    }
  }, [errorUpdatedAt, isError, notificationsService, translate]);

  const columns = useMemo<TableColumn<Bot>[]>(
    () => [
      {
        header: translate('columns.bot'),
        key: 'label',
        sortable: true,
        subtext: (bot) => bot.description,
      },
      {
        header: translate('columns.status'),
        key: 'status',
        render: (bot) => (
          <Badge variant={getBotStatusVariant(bot.status)}>
            {formatEnumLabel(bot.status)}
          </Badge>
        ),
        sortable: true,
      },
      {
        header: translate('columns.category'),
        key: 'category',
        render: (bot) => formatEnumLabel(bot.category),
        sortable: true,
      },
      {
        header: translate('columns.platforms'),
        key: 'platforms',
        render: (bot) =>
          bot.platforms?.length ? (
            <span className="flex items-center gap-1">
              {bot.platforms.map((platform) => (
                <PlatformBadge
                  key={platform}
                  platform={platform}
                  showLabel={false}
                  size={ComponentSize.SM}
                />
              ))}
            </span>
          ) : (
            EMPTY_VALUE
          ),
      },
      {
        header: translate('columns.targets'),
        key: 'targets',
        render: (bot) =>
          bot.targets
            ?.map((target) => target.channelLabel || target.channelId)
            .join(', ') || EMPTY_VALUE,
      },
      {
        header: translate('columns.messages'),
        key: 'messagesCount',
        render: (bot) => bot.messagesCount ?? 0,
      },
      {
        header: translate('columns.engagements'),
        key: 'engagementsCount',
        render: (bot) => bot.engagementsCount ?? 0,
      },
      {
        header: translate('columns.lastActivity'),
        key: 'lastActivityAt',
        render: (bot) =>
          bot.lastActivityAt ? (
            <TableDateCell value={bot.lastActivityAt} />
          ) : (
            translate('never')
          ),
      },
    ],
    [translate],
  );

  return (
    <AdminPageShell
      title={translate('title')}
      icon={BotIcon}
      search={
        <SearchField
          ariaLabel={searchT('bots')}
          onSearch={setSearch}
          placeholder={searchT('bots')}
          value={search}
        >
          <AdminScopeFilter isAttached />
        </SearchField>
      }
      onRefresh={() => void refetch()}
      isRefreshing={isRefreshing}
    >
      <AppTable<Bot>
        key={`${organization}:${brand}`}
        items={bots}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(bot) => bot.id}
        emptyLabel={translate('empty')}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />
      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel={translate('totalLabel')}
          totals={botsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </AdminPageShell>
  );
}
