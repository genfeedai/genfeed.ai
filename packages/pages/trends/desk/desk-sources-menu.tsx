'use client';

import { ButtonSize, ButtonVariant, SocialSourceType } from '@genfeedai/enums';
import type { ISocialSource } from '@genfeedai/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import FollowSourceModal from '@pages/trends/following/FollowSourceModal';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { List, Plus, RefreshCw, Trash2, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

function SourceRow({
  busyId,
  onRemove,
  onSync,
  source,
}: {
  busyId: string | null;
  onRemove: (id: string) => Promise<void>;
  onSync: (id: string) => Promise<void>;
  source: ISocialSource;
}) {
  const translateDesk = useTranslations('common.trends.desk');
  const isImportContainer = source.sourceType === SocialSourceType.POST;
  const syncStatus = source.lastSyncStatus ?? null;
  const statusLabel =
    syncStatus === 'failed'
      ? 'Failed'
      : syncStatus === 'empty'
        ? 'Empty'
        : syncStatus === 'success'
          ? 'OK'
          : null;
  const statusClass =
    syncStatus === 'failed'
      ? 'text-destructive'
      : syncStatus === 'empty'
        ? 'text-warning'
        : 'text-foreground/52';

  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {getPlatformIcon(source.platform, 'h-4 w-4')}
          <span className="truncate">
            @{source.handle || source.displayName || 'source'}
          </span>
          {isImportContainer ? (
            <Badge variant="ghost">
              {translateDesk('sourcesMenu.imported')}
            </Badge>
          ) : null}
          {statusLabel ? (
            <Badge
              variant={
                syncStatus === 'failed'
                  ? 'error'
                  : syncStatus === 'empty'
                    ? 'warning'
                    : 'secondary'
              }
            >
              {statusLabel}
            </Badge>
          ) : null}
        </div>
        <div className={`mt-1 text-xs ${statusClass}`}>
          {isImportContainer
            ? 'Imported posts — re-import a post URL to refresh metrics'
            : source.lastSyncedAt
              ? `Synced ${getRelativeTime(source.lastSyncedAt)}`
              : 'Never synced'}
        </div>
        {source.lastSyncError ? (
          <p className="mt-1 text-xs leading-5 text-foreground/55">
            {source.lastSyncError}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isImportContainer ? (
          <Button
            ariaLabel="Sync source"
            icon={<RefreshCw className="size-4" />}
            isLoading={busyId === source.id}
            label=""
            onClick={() => {
              onSync(source.id).catch(() => undefined);
            }}
            size={ButtonSize.SM}
            tooltip="Sync source"
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        <Button
          ariaLabel="Remove source"
          icon={<Trash2 className="size-4" />}
          label=""
          onClick={() => {
            onRemove(source.id).catch(() => undefined);
          }}
          size={ButtonSize.SM}
          tooltip="Remove source"
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}

/**
 * Sources control for the Desk: Follow / Manage / Sync all, formerly
 * `following-page.tsx`'s dedicated topbar actions and "Manage sources"
 * dialog. Owns its own sync/remove/follow service calls and reports back
 * through `onSourcesChanged` so the Desk data hook can refetch.
 */
export default function DeskSourcesMenu({
  brandId,
  onSourcesChanged,
  sources,
}: {
  brandId: string;
  onSourcesChanged: () => Promise<void>;
  sources: ISocialSource[];
}) {
  const translateDesk = useTranslations('common.trends.desk');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [isFollowOpen, setIsFollowOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );

  const syncAll = useCallback(async () => {
    try {
      setBusyId('sync-all');
      const service = await getSocialSourcesService();
      const result = await service.syncBrand({ brandId, limit: 25 });
      if (result.failures?.length) {
        notifications.error(
          `${result.failures.length} source${result.failures.length === 1 ? '' : 's'} failed to sync`,
        );
      }
      if (result.count > 0) {
        notifications.success(
          result.count === 1 ? 'Synced 1 post' : `Synced ${result.count} posts`,
        );
      } else if (!result.failures?.length) {
        notifications.error(
          'Sync finished with 0 posts — check X API / Apify configuration',
        );
      }
      await onSourcesChanged();
    } catch (error) {
      logger.error('Failed to sync sources', error);
      notifications.error(
        (error as Error)?.message || 'Failed to sync sources',
      );
    } finally {
      setBusyId(null);
    }
  }, [brandId, getSocialSourcesService, notifications, onSourcesChanged]);

  const syncSource = useCallback(
    async (sourceId: string) => {
      try {
        setBusyId(sourceId);
        const service = await getSocialSourcesService();
        const result = await service.syncSource(sourceId, {
          brandId,
          limit: 25,
        });
        if (result.count > 0) {
          notifications.success(
            result.count === 1
              ? 'Synced 1 post'
              : `Synced ${result.count} posts`,
          );
        } else {
          notifications.error(
            'Sync finished with 0 posts — timeline may be empty or the collector failed silently before; check last sync error in Manage sources',
          );
        }
        await onSourcesChanged();
      } catch (error) {
        logger.error('Failed to sync source', error);
        notifications.error(
          (error as Error)?.message || 'Failed to sync source',
        );
      } finally {
        setBusyId(null);
      }
    },
    [brandId, getSocialSourcesService, notifications, onSourcesChanged],
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      try {
        setBusyId(sourceId);
        const service = await getSocialSourcesService();
        await service.delete(sourceId);
        notifications.success('Source removed');
        await onSourcesChanged();
      } catch (error) {
        logger.error('Failed to remove source', error);
        notifications.error('Failed to remove source');
      } finally {
        setBusyId(null);
      }
    },
    [getSocialSourcesService, notifications, onSourcesChanged],
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={<UsersRound className="size-4" />}
            label="Sources"
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setIsFollowOpen(true)}>
            <Plus className="size-4" />
            {translateDesk('sourcesMenu.followSource')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={sources.length === 0}
            onSelect={() => setIsManageOpen(true)}
          >
            <List className="size-4" />
            {translateDesk('sourcesMenu.manageSources')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={sources.length === 0 || busyId === 'sync-all'}
            onSelect={() => {
              void syncAll();
            }}
          >
            <RefreshCw className="size-4" />
            {translateDesk('sourcesMenu.syncAll')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FollowSourceModal
        brandId={brandId}
        existingSources={sources}
        open={isFollowOpen}
        onOpenChange={setIsFollowOpen}
        onFollowed={onSourcesChanged}
      />

      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {translateDesk('sourcesMenu.manageSources')}
            </DialogTitle>
            <DialogDescription>
              {translateDesk('sourcesMenu.manageSourcesDescription', {
                count: sources.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-card border border-border">
            {sources.length ? (
              sources.map((source) => (
                <SourceRow
                  key={source.id}
                  busyId={busyId}
                  source={source}
                  onRemove={removeSource}
                  onSync={syncSource}
                />
              ))
            ) : (
              <div className="p-5 text-sm text-foreground/62">
                {translateDesk('sourcesMenu.noSourcesFollowed')}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              icon={<Plus className="size-4" />}
              label="Follow source"
              onClick={() => {
                setIsManageOpen(false);
                setIsFollowOpen(true);
              }}
              variant={ButtonVariant.SECONDARY}
            />
            <Button
              icon={<RefreshCw className="size-4" />}
              isLoading={busyId === 'sync-all'}
              label="Sync all"
              onClick={() => {
                syncAll().catch(() => undefined);
              }}
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
