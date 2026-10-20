'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IReplyTargetSuggestion } from '@genfeedai/contracts/interfaces';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { RepliesWarmupTargetsProps } from '@props/messages/replies-warmup-targets.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Suggests X accounts in the brand's niche and adds the chosen ones to the
 * warm-up monitor. Searching reads X; nothing is replied to from here.
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
  const [monitored, setMonitored] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [busyUsername, setBusyUsername] = useState<string | null>(null);

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

  async function handleMonitor(username: string) {
    setBusyUsername(username);
    try {
      const service = await getReplyBotConfigsService();
      await service.addWarmupTarget({ brandId, username });
      setMonitored((previous) => [...previous, username]);
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

  return (
    <Card
      label={translate('title')}
      description={translate('description')}
      bodyClassName="gap-4 p-4"
    >
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
        const isMonitored = monitored.includes(suggestion.username);

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
                isDisabled={isMonitored || busyUsername === suggestion.username}
                onClick={() => void handleMonitor(suggestion.username)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                {translate(isMonitored ? 'monitoring' : 'monitor')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {suggestion.samplePostText}
            </p>
          </div>
        );
      })}
    </Card>
  );
}
