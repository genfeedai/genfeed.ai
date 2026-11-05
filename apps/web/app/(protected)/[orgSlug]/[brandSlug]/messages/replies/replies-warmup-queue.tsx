'use client';

import { ButtonSize, ButtonVariant, CardGap } from '@genfeedai/contracts';
import { ASSISTED_X_REPLY_MAX_LENGTH } from '@genfeedai/contracts/constants';
import type { IAssistedReplyUsage } from '@genfeedai/contracts/interfaces';
import type { BotActivity } from '@genfeedai/models/automation/bot-activity.model';
import { BotActivitiesService } from '@genfeedai/services/automation/bot-activities.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const LEADING_AT_SIGN_PATTERN = /^@/;
const QUEUE_LIMIT = 20;
const REPLY_QUEUE_KEY = ['reply-warmup-queue'] as const;
const REPLY_QUEUE_USAGE_KEY = ['reply-warmup-usage'] as const;
const EMPTY_ITEMS: BotActivity[] = [];

/**
 * Replies the account monitor drafted for accounts that never contacted the
 * brand. Genfeed does not post them: each opens in X's own composer and counts
 * toward the daily cap once the person confirms they posted it.
 */
export default function RepliesWarmupQueue() {
  const locale = useLocale();
  const translate = useTranslations('common.automation.replies.queue');
  const getBotActivitiesService = useAuthedService((token: string) =>
    BotActivitiesService.getInstance(token),
  );
  const queryClient = useQueryClient();
  // Cached per viewer: coming back to Replies paints the queue and the daily
  // usage at once, then refreshes them in the background.
  const queueQuery = useAuthedQuery({
    queryFn: async (service) => {
      const queue = await service.findAwaitingApproval({ limit: QUEUE_LIMIT });
      return queue.data;
    },
    queryKey: [...REPLY_QUEUE_KEY, { limit: QUEUE_LIMIT }],
    service: (token: string) => BotActivitiesService.getInstance(token),
  });
  const usageQuery = useAuthedQuery({
    queryFn: (service) => service.getReplyQueueUsage(),
    queryKey: REPLY_QUEUE_USAGE_KEY,
    service: (token: string) => BotActivitiesService.getInstance(token),
  });
  const items = queueQuery.data ?? EMPTY_ITEMS;
  const usage = usageQuery.data ?? null;
  const isLoading = queueQuery.isPending;
  const loadError = queueQuery.error ?? usageQuery.error;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loadError) {
      return;
    }
    logger.error('Warm-up reply queue failed to load', loadError);
    toast.error(translate('loadFailed'));
  }, [loadError, translate]);

  function draftOf(item: BotActivity): string {
    return drafts[item.id] ?? item.draftReplyText ?? '';
  }

  async function runAction(
    item: BotActivity,
    action: (service: BotActivitiesService) => Promise<void>,
  ) {
    setBusyId(item.id);
    try {
      await action(await getBotActivitiesService());
    } catch (error: unknown) {
      logger.error('Warm-up reply action failed', error);
      toast.error(
        error instanceof Error ? error.message : translate('actionFailed'),
      );
    } finally {
      setBusyId(null);
    }
  }

  function applyUsage(nextUsage: IAssistedReplyUsage) {
    queryClient.setQueriesData<IAssistedReplyUsage>(
      { queryKey: REPLY_QUEUE_USAGE_KEY },
      nextUsage,
    );
  }

  function removeItem(id: string) {
    queryClient.setQueriesData<BotActivity[]>(
      { queryKey: REPLY_QUEUE_KEY },
      (previous) => previous?.filter((row) => row.id !== id),
    );
    setOpenedIds((previous) => previous.filter((openedId) => openedId !== id));
  }

  function handleOpen(item: BotActivity) {
    return runAction(item, async (service) => {
      const result = await service.openReplyQueueItem(item.id, draftOf(item));
      window.open(result.intentUrl, '_blank', 'noopener,noreferrer');
      setOpenedIds((previous) => [...previous, item.id]);
      toast.message(translate('opened'));
    });
  }

  function handlePosted(item: BotActivity) {
    return runAction(item, async (service) => {
      applyUsage(await service.confirmReplyQueueItemPosted(item.id));
      removeItem(item.id);
      toast.success(translate('posted'));
    });
  }

  function handleDismiss(item: BotActivity) {
    return runAction(item, async (service) => {
      applyUsage(await service.dismissReplyQueueItem(item.id));
      removeItem(item.id);
      toast.message(translate('dismissed'));
    });
  }

  const isCapReached = usage ? usage.remainingToday <= 0 : false;

  return (
    <Card
      label={translate('title')}
      gap={CardGap.LG}
      headerAction={
        usage ? (
          <Badge variant={isCapReached ? 'warning' : 'outline'}>
            {translate('usage', {
              cap: usage.dailyCap,
              posted: usage.postedToday,
            })}
          </Badge>
        ) : null
      }
    >
      {usage?.nextAllowedAt ? (
        <p className="text-sm text-muted-foreground">
          {translate('nextAllowed', {
            time: new Date(usage.nextAllowedAt).toLocaleTimeString(locale),
          })}
        </p>
      ) : null}
      {!isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
      ) : null}
      {items.map((item) => {
        const draft = draftOf(item);
        const author = (item.triggerTweetAuthorUsername ?? '').replace(
          LEADING_AT_SIGN_PATTERN,
          '',
        );
        const isBusy = busyId === item.id;
        const hasOpened = openedIds.includes(item.id);

        return (
          <div
            key={item.id}
            className="flex flex-col gap-3 border-t border-border pt-4"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">@{author}</span>
              <p className="text-sm text-muted-foreground">
                {item.triggerTweetText}
              </p>
            </div>
            <Textarea
              aria-label={translate('replyLabel', { author })}
              isDisabled={isBusy}
              maxLength={ASSISTED_X_REPLY_MAX_LENGTH}
              onChange={(event) =>
                setDrafts((previous) => ({
                  ...previous,
                  [item.id]: event.target.value,
                }))
              }
              value={draft}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                isDisabled={isBusy || isCapReached || !draft.trim()}
                onClick={() => void handleOpen(item)}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              >
                {translate('openInX')}
              </Button>
              {hasOpened ? (
                <Button
                  isDisabled={isBusy}
                  onClick={() => void handlePosted(item)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                >
                  {translate('markPosted')}
                </Button>
              ) : null}
              <Button
                isDisabled={isBusy}
                onClick={() => void handleDismiss(item)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                {translate('dismiss')}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {translate('characters', {
                  count: draft.length,
                  max: ASSISTED_X_REPLY_MAX_LENGTH,
                })}
              </span>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
