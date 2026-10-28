'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { WARMUP_MAX_MONITORED_TARGETS } from '@genfeedai/contracts/constants';
import type {
  IReplyTarget,
  IReplyTargetSuggestion,
} from '@genfeedai/contracts/interfaces';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { RepliesWarmupTargetsProps } from '@props/messages/replies-warmup-targets.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Suggests X accounts in the brand's niche, adds the chosen ones to the
 * warm-up monitor and lists the accounts it follows so one can be removed to
 * free a slot. Searching reads X; nothing is replied to from here.
 */
export default function RepliesWarmupTargets({
  brandId,
}: RepliesWarmupTargetsProps) {
  const locale = useLocale();
  const translate = useTranslations('common.automation.replies.targets');
  const getReplyBotConfigsService = useAuthedService((token: string) =>
    ReplyBotConfigsService.getInstance(token),
  );
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<
    IReplyTargetSuggestion[] | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const [targets, setTargets] = useState<IReplyTarget[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [busyUsername, setBusyUsername] = useState<string | null>(null);

  const loadTargets = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const service = await getReplyBotConfigsService();
      const nextTargets = await service.listWarmupTargets(brandId);
      if (controller.signal.aborted) {
        return;
      }
      setTargets(nextTargets);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      logger.error('Warm-up targets failed to load', error);
      toast.error(translate('loadFailed'));
    }
  }, [brandId, getReplyBotConfigsService, translate]);

  useEffect(() => {
    void loadTargets();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadTargets]);

  function isMonitored(username: string): boolean {
    const normalized = username.toLowerCase();
    return targets.some(
      (target) => target.username.toLowerCase() === normalized,
    );
  }

  async function handleSearch() {
    setIsSearching(true);
    try {
      const service = await getReplyBotConfigsService();
      setSuggestions(await service.discoverWarmupTargets({ brandId, query }));
    } catch (error: unknown) {
      logger.error('Warm-up target search failed', error);
      toast.error(translate('searchFailed'));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleMonitor(suggestion: IReplyTargetSuggestion) {
    const { username } = suggestion;
    setBusyUsername(username);
    try {
      const service = await getReplyBotConfigsService();
      const result = await service.addWarmupTarget({ brandId, username });
      setTargets((previous) => [
        {
          displayName: suggestion.displayName,
          followersCount: suggestion.followersCount,
          isActive: true,
          monitoredAccountId: result.monitoredAccountId,
          username: result.username,
        },
        ...previous,
      ]);
      toast.success(translate('added', { username }));
    } catch (error: unknown) {
      logger.error('Warm-up target add failed', error);
      toast.error(
        error instanceof Error ? error.message : translate('addFailed'),
      );
    } finally {
      setBusyUsername(null);
    }
  }

  async function handleRemove(target: IReplyTarget) {
    setBusyUsername(target.username);
    try {
      const service = await getReplyBotConfigsService();
      await service.removeWarmupTarget({
        brandId,
        monitoredAccountId: target.monitoredAccountId,
      });
      setTargets((previous) =>
        previous.filter(
          (item) => item.monitoredAccountId !== target.monitoredAccountId,
        ),
      );
      toast.success(translate('removed', { username: target.username }));
    } catch (error: unknown) {
      logger.error('Warm-up target remove failed', error);
      toast.error(translate('removeFailed'));
    } finally {
      setBusyUsername(null);
    }
  }

  return (
    <Card label={translate('title')} bodyClassName="gap-4 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label={translate('queryLabel')}
          className="min-w-64 flex-1"
          isDisabled={isSearching}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={translate('queryPlaceholder')}
          value={query}
        />
        <Button
          isDisabled={isSearching || query.trim().length < 3}
          onClick={() => void handleSearch()}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        >
          {translate(isSearching ? 'searching' : 'search')}
        </Button>
      </div>
      {suggestions && suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
      ) : null}
      {(suggestions ?? []).map((suggestion) => {
        const isSuggestionMonitored = isMonitored(suggestion.username);

        return (
          <div
            key={suggestion.username}
            className="flex flex-col gap-2 border-t border-border pt-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                @{suggestion.username}
              </span>
              <Badge variant="outline">
                {translate('followers', {
                  count: suggestion.followersCount.toLocaleString(locale),
                })}
              </Badge>
              <Badge variant="outline">
                {translate('matchedPosts', { count: suggestion.matchedPosts })}
              </Badge>
              <Button
                className="ml-auto"
                isDisabled={
                  isSuggestionMonitored || busyUsername === suggestion.username
                }
                onClick={() => void handleMonitor(suggestion)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                {translate(isSuggestionMonitored ? 'monitoring' : 'monitor')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {suggestion.samplePostText}
            </p>
          </div>
        );
      })}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-sm font-medium">
          {translate('monitoredTitle', {
            count: targets.length,
            limit: WARMUP_MAX_MONITORED_TARGETS,
          })}
        </span>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate('monitoredEmpty')}
          </p>
        ) : null}
        {targets.map((target) => (
          <div
            key={target.monitoredAccountId}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-sm">@{target.username}</span>
            {target.followersCount !== undefined ? (
              <Badge variant="outline">
                {translate('followers', {
                  count: target.followersCount.toLocaleString(locale),
                })}
              </Badge>
            ) : null}
            <Button
              ariaLabel={translate('removeLabel', {
                username: target.username,
              })}
              className="ml-auto"
              isDisabled={busyUsername === target.username}
              onClick={() => void handleRemove(target)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            >
              {translate('remove')}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
