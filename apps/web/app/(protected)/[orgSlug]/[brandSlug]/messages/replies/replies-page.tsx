'use client';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  formatPlatformLabel,
  isYouTubePlatform,
  Platform,
  parsePlatform,
} from '@genfeedai/contracts';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQueryClient } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import Loading from '@ui/loading/default/Loading';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { MessageCircleReply } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import { usePlatformOAuthConnect } from '@/hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import type {
  DraftState,
  InboxItem,
  IntentState,
  RepliesInboxData,
  ReplyIntent,
} from '@/props/messages/replies-page.props';
import { filterInboxItems } from './filter-inbox-items';
import RepliesReplyComposer from './replies-reply-composer';
import RepliesWarmupQueue from './replies-warmup-queue';
import RepliesWarmupTargets from './replies-warmup-targets';

const LEADING_AT_SIGN_PATTERN = /^@/;

const EMPTY_ITEMS: InboxItem[] = [];
const INBOX_SKELETON_KEYS = [
  'inbox-skeleton-1',
  'inbox-skeleton-2',
  'inbox-skeleton-3',
] as const;

function intentBadgeVariant(
  intent: ReplyIntent,
): 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'info' {
  switch (intent) {
    case 'thanks':
      return 'success';
    case 'question':
      return 'info';
    case 'troll':
      return 'warning';
    case 'spam':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function RepliesPage() {
  const translate = useTranslations('common.automation.replies');
  const { search, setSearch } = useAdminSearchParam();
  const router = useRouter();
  const { orgSlug } = useOrgUrl();
  const { brandId: scopedBrandId, pageScope } = useCollectionScope();
  const { brand, isLoading: isBrandLoading } = useBrandDetail();
  const getReplyBotService = useAuthedService((token: string) =>
    ReplyBotConfigsService.getInstance(token),
  );
  const connectPlatform = usePlatformOAuthConnect({ brandId: brand?.id });
  const [isConnecting, setIsConnecting] = useState(false);

  const [inboxPlatform, setInboxPlatform] = useState<
    Platform.TWITTER | Platform.YOUTUBE
  >(Platform.TWITTER);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [intents, setIntents] = useState<IntentState>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const brandId = scopedBrandId;
  const queryClient = useQueryClient();
  const inboxKey = [
    'replies',
    'inbox',
    brandId ?? null,
    inboxPlatform,
  ] as const;
  // Cached: coming back to Replies paints the inbox it already has while it
  // refreshes. Every inbox read bills the X API, so a return visit inside the
  // stale window reads nothing.
  const inboxQuery = useAuthedQuery<ReplyBotConfigsService, RepliesInboxData>({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) => {
      try {
        const result = await service.getAuthorReplyInbox({
          brandId: brandId as string,
          hours: isYouTubePlatform(inboxPlatform) ? 48 : 24,
          platform: inboxPlatform,
        });
        return {
          items: (result.items ?? []) as InboxItem[],
          platformLabel: formatPlatformLabel(result.platform) ?? 'X',
          username: result.username,
        };
      } catch (error: unknown) {
        if (!signal.aborted) {
          logger.error('Replies inbox failed', error);
        }
        throw error;
      }
    },
    queryKey: inboxKey,
    service: (token: string) => ReplyBotConfigsService.getInstance(token),
  });
  const { error, errorUpdatedAt, isError, isFetching, isPending, refetch } =
    inboxQuery;
  const items = inboxQuery.data?.items ?? EMPTY_ITEMS;
  const username = inboxQuery.data?.username;
  const platformLabel =
    inboxQuery.data?.platformLabel ?? formatPlatformLabel(inboxPlatform) ?? 'X';
  // Pending, not just fetching: until the first read lands the inbox is a
  // skeleton, never the "Inbox clear" card.
  const isLoading = isPending && !isError;
  const inboxError = isError
    ? error instanceof Error
      ? error.message
      : 'Could not load replies inbox'
    : null;
  const visibleItems = useMemo(
    () => filterInboxItems(items, search),
    [items, search],
  );

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (inboxError) {
      toast.error(inboxError);
    }
  }, [errorUpdatedAt, inboxError]);

  const loadInbox = useCallback(async () => {
    await refetch();
  }, [refetch]);

  async function handleEnableAuto() {
    if (!brandId) {
      return;
    }
    setIsEnabling(true);
    try {
      const service = await getReplyBotService();
      const result = await service.ensureAuthorResponder({
        brandId,
        isActive: true,
        platform: inboxPlatform,
      });
      setIsActive(result.isActive);
      const label = formatPlatformLabel(inboxPlatform) ?? 'X';
      toast.success(
        result.created
          ? `Auto-replies enabled for ${label}`
          : 'Auto-replies updated',
      );
      await loadInbox();
    } catch (error: unknown) {
      logger.error('Enable auto-replies failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : isYouTubePlatform(inboxPlatform)
            ? 'Connect YouTube for this brand first'
            : 'Connect X for this brand first',
      );
    } finally {
      setIsEnabling(false);
    }
  }

  async function handleDraft(item: InboxItem) {
    if (!brandId) {
      return;
    }
    setBusyId(item.commentId);
    try {
      const service = await getReplyBotService();
      const intent = intents[item.commentId] ?? item.intent;
      const result = await service.draftAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentId: item.commentId,
        commentText: item.commentText,
        intent,
        parentPostPreview: item.parentPostPreview,
        platform: inboxPlatform,
      });
      setDrafts((prev) => ({ ...prev, [item.commentId]: result.draft }));
      if (result.intent) {
        setIntents((prev) => ({
          ...prev,
          [item.commentId]: result.intent as ReplyIntent,
        }));
      }
      if (result.harnessApplied) {
        toast.success(`Draft ready (${result.intentLabel})`);
      } else if (result.intent === 'spam') {
        toast.message('Marked spam — auto draft skipped');
      }
    } catch (error: unknown) {
      logger.error('Draft reply failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not draft reply',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(item: InboxItem) {
    if (!brandId) {
      return;
    }
    setBusyId(item.commentId);
    try {
      const service = await getReplyBotService();
      const intent = intents[item.commentId] ?? item.intent;
      const result = await service.sendAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentAuthorId: item.authorId,
        commentId: item.commentId,
        commentText: item.commentText,
        intent,
        parentPostId: item.parentPostId,
        parentPostPreview: item.parentPostPreview,
        platform: inboxPlatform,
        replyText: drafts[item.commentId],
      });
      if (!result.success) {
        throw new Error(result.error || 'Send failed');
      }
      toast.success('Reply sent');
      queryClient.setQueriesData<RepliesInboxData>(
        { queryKey: inboxKey },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.filter(
                  (row) => row.commentId !== item.commentId,
                ),
              }
            : current,
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.commentId];
        return next;
      });
    } catch (error: unknown) {
      logger.error('Send reply failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not send reply',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleConnectPlatform() {
    if (!brandId) {
      return;
    }
    setIsConnecting(true);
    try {
      await connectPlatform(inboxPlatform);
    } catch (error: unknown) {
      logger.error('Replies platform connect failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : isYouTubePlatform(inboxPlatform)
            ? 'Could not connect YouTube'
            : 'Could not connect X',
      );
      setIsConnecting(false);
    }
  }

  if (pageScope === 'org' && !brandId) {
    return (
      <Container label="Replies">
        <EmptyState
          title="Choose a brand to review replies"
          icon={MessageCircleReply}
          action={{
            label: 'Manage brands',
            onClick: () => router.push(`/${orgSlug}/~/settings/brands`),
            variant: ButtonVariant.SECONDARY,
          }}
        />
      </Container>
    );
  }

  if (isBrandLoading || !brandId) {
    return <Loading />;
  }

  return (
    <Container
      className="flex flex-col gap-6"
      label="Replies"
      refresh={
        <ButtonRefresh
          onClick={() => void loadInbox()}
          isRefreshing={isFetching}
        />
      }
      leading={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={setSearch}
          placeholder={translate('search')}
          value={search}
        >
          <FilterMenu
            facets={[
              {
                defaultValue: Platform.TWITTER,
                key: 'platform',
                label: translate('platform.label'),
                onChange: (value) => {
                  const platform = parsePlatform(value);
                  if (
                    platform === Platform.TWITTER ||
                    platform === Platform.YOUTUBE
                  ) {
                    setInboxPlatform(platform);
                  }
                },
                options: [
                  {
                    label: translate('platform.twitter'),
                    value: Platform.TWITTER,
                  },
                  {
                    label: translate('platform.youtube'),
                    value: Platform.YOUTUBE,
                  },
                ],
                selection: 'single',
                value: inboxPlatform,
              },
            ]}
            isAttached
            onClear={() => {
              setInboxPlatform(Platform.TWITTER);
            }}
          />
        </SearchField>
      }
      right={
        <SubbarControls
          primaryAction={
            <Button
              isDisabled={isEnabling}
              onClick={() => void handleEnableAuto()}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            >
              {isEnabling ? 'Enabling…' : 'Enable auto-replies'}
            </Button>
          }
        />
      }
    >
      <Card label="Inbox status" gap={CardGap.LG}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <MessageCircleReply className="mr-1 size-3.5" />
            {platformLabel}
          </Badge>
          {username ? (
            <Badge variant="outline">
              @{username.replace(LEADING_AT_SIGN_PATTERN, '')}
            </Badge>
          ) : null}
          {isActive ? (
            <Badge variant="success">{translate('status.on')}</Badge>
          ) : (
            <Badge variant="warning">{translate('status.off')}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
        {inboxError ? <Alert variant="destructive">{inboxError}</Alert> : null}
      </Card>

      {inboxPlatform === Platform.TWITTER ? <RepliesWarmupQueue /> : null}
      {inboxPlatform === Platform.TWITTER && brandId ? (
        <RepliesWarmupTargets brandId={brandId} />
      ) : null}

      {isLoading ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          {INBOX_SKELETON_KEYS.map((key) => (
            <SkeletonCard
              key={key}
              label={translate('loadingReply')}
              showImage={false}
            />
          ))}
        </div>
      ) : search && items.length > 0 && visibleItems.length === 0 ? (
        <Card
          label={translate('emptySearchTitle')}
          bodyClassName="flex flex-col"
        />
      ) : items.length === 0 ? (
        <Card
          label={inboxError ? 'Inbox unavailable' : 'Inbox clear'}
          description={
            inboxError
              ? inboxError
              : isYouTubePlatform(inboxPlatform)
                ? 'No unreplied YouTube comments in the last 48 hours — connect YouTube for this brand, or check back after people comment.'
                : 'No unreplied comments in the last 24 hours — connect X and post, or check back after people reply.'
          }
          bodyClassName="flex flex-col"
          headerAction={
            <Button
              isDisabled={isConnecting}
              onClick={() => void handleConnectPlatform()}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              {isConnecting
                ? 'Connecting…'
                : isYouTubePlatform(inboxPlatform)
                  ? 'Connect YouTube'
                  : 'Connect X'}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleItems.map((item) => {
            const intent = intents[item.commentId] ?? item.intent;
            return (
              <Card
                key={item.commentId}
                label={`@${item.authorUsername.replace(LEADING_AT_SIGN_PATTERN, '')}`}
                description={
                  item.parentPostPreview
                    ? `On: ${item.parentPostPreview}`
                    : 'On your post'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={intentBadgeVariant(intent)}>
                    {item.intentLabel || intent}
                  </Badge>
                  {item.shouldSkipAuto ? (
                    <Badge variant="destructive">
                      {translate('status.skipAuto')}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {item.commentText}
                </p>
                <RepliesReplyComposer
                  authorUsername={item.authorUsername}
                  draft={drafts[item.commentId] ?? ''}
                  intent={intent}
                  isBusy={busyId === item.commentId}
                  onDraft={() => void handleDraft(item)}
                  onDraftChange={(value) =>
                    setDrafts((prev) => ({ ...prev, [item.commentId]: value }))
                  }
                  onIntentChange={(value) =>
                    setIntents((prev) => ({ ...prev, [item.commentId]: value }))
                  }
                  onSend={() => void handleSend(item)}
                />
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
