'use client';
import {
  BotStatus,
  ComponentSize,
  formatEnumLabel,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Bot } from '@models/automation/bot.model';
import { BotsService } from '@services/automation/bots.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';

import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { EmptyState } from '@ui/primitives/empty-state';
import { Bot as BotIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

const BOT_SKELETON_KEYS = [
  'bot-skeleton-1',
  'bot-skeleton-2',
  'bot-skeleton-3',
  'bot-skeleton-4',
] as const;

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

export default function BotsPage() {
  const notificationsService = NotificationsService.getInstance();

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();

  // Cached per page and search: coming back to Bots paints the rows it
  // already has while it refreshes, and paging keeps the current rows on screen.
  const botsQuery = useAuthedQuery({
    keepPreviousDataWithin: ['admin', 'bots'],
    queryFn: async (service, signal) => {
      try {
        const fetchedBots = await service.findAll(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(search ? { search } : {}),
            sort: 'createdAt: -1',
          },
          signal,
        );
        logger.info('Loaded bots', { count: fetchedBots.length });
        return fetchedBots;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load bots', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'bots', { page: currentPage, search }],
    service: (token: string) => BotsService.getInstance(token),
  });
  const bots = botsQuery.data ?? EMPTY_BOTS;
  const { isLoading, refetch } = botsQuery;
  const isRefreshing = botsQuery.isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  const { errorUpdatedAt, isError } = botsQuery;
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load bots');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  return (
    <AdminPageShell
      title="Bots"
      icon={BotIcon}
      search={
        <SearchField
          ariaLabel={searchT('bots')}
          onSearch={setSearch}
          placeholder={searchT('bots')}
          value={search}
        />
      }
      onRefresh={() => void refetch()}
      isRefreshing={isRefreshing}
    >
      <WorkspaceSurface
        framed={false}
        tone="muted"
        data-testid="automation-bots-surface"
      >
        <div className="grid gap-4">
          {isLoading ? (
            BOT_SKELETON_KEYS.map((key) => (
              <SkeletonCard key={key} showImage={false} />
            ))
          ) : bots.length === 0 ? (
            <EmptyState
              title={search ? 'No bots match your search' : 'No bots yet'}
            />
          ) : (
            bots.map((bot: Bot) => (
              <Card key={bot.id}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="card-label text-sm font-semibold">
                          {bot.label}
                        </h3>
                        <Badge variant={getBotStatusVariant(bot.status)}>
                          {formatEnumLabel(bot.status)}
                        </Badge>

                        <Badge variant="outline">{bot.category}</Badge>
                      </div>

                      {bot.description && (
                        <p className="text-foreground/70 mb-3">
                          {bot.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-foreground/60 mb-3">
                        {bot.platforms && bot.platforms.length > 0 && (
                          <span>Platforms: {bot.platforms.join(', ')}</span>
                        )}
                        {bot.messagesCount !== undefined && (
                          <span>{bot.messagesCount} messages</span>
                        )}
                        {bot.engagementsCount !== undefined && (
                          <span>{bot.engagementsCount} engagements</span>
                        )}
                      </div>

                      {bot.targets && bot.targets.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="text-xs text-foreground/60">
                            Targets:
                          </span>
                          {bot.targets.map((target) => (
                            <span
                              key={`${target.platform}:${target.channelId}:${target.channelLabel ?? ''}`}
                              className="inline-flex items-center gap-1 bg-background px-2 py-1 text-xs"
                            >
                              <PlatformBadge
                                platform={target.platform}
                                showLabel={false}
                                size={ComponentSize.SM}
                              />
                              <code>
                                {target.channelLabel || target.channelId}
                              </code>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="bots" />
        </div>
      </WorkspaceSurface>
    </AdminPageShell>
  );
}
