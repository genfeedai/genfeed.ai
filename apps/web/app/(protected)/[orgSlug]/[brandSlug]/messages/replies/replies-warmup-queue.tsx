'use client';

import { ButtonSize, ButtonVariant, CardGap } from '@genfeedai/contracts';
import { ASSISTED_X_REPLY_MAX_LENGTH } from '@genfeedai/contracts/constants';
import type { IAssistedReplyUsage } from '@genfeedai/contracts/interfaces';
import type { BotActivity } from '@genfeedai/models/automation/bot-activity.model';
import { BotActivitiesService } from '@genfeedai/services/automation/bot-activities.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<BotActivity[]>([]);
  const [usage, setUsage] = useState<IAssistedReplyUsage | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const service = await getBotActivitiesService();
      const [queue, nextUsage] = await Promise.all([
        service.findAwaitingApproval({ limit: 20 }),
        service.getReplyQueueUsage(),
      ]);
      if (controller.signal.aborted) {
        return;
      }
      setItems(queue.data);
      setUsage(nextUsage);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      logger.error('Warm-up reply queue failed to load', error);
      toast.error(translate('loadFailed'));
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [getBotActivitiesService, translate]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

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

  function removeItem(id: string) {
    setItems((previous) => previous.filter((row) => row.id !== id));
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
      setUsage(await service.confirmReplyQueueItemPosted(item.id));
      removeItem(item.id);
      toast.success(translate('posted'));
    });
  }

  function handleDismiss(item: BotActivity) {
    return runAction(item, async (service) => {
      setUsage(await service.dismissReplyQueueItem(item.id));
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
          /^@/,
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
