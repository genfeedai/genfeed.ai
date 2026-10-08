'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  NativeSocialAction,
  SocialTimelineResponse,
  SourcePostNativeActionInput,
} from '@genfeedai/contracts/interfaces';
import { getSafeExternalUrl } from '@genfeedai/helpers/media/social-media-source.helper';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ConnectedTimelinePostProps } from '@props/trends/connected-timeline.props';
import { SocialTimelinesService } from '@services/social/social-timelines.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SocialMediaPlayer from '@ui/analytics/trends/social-media-player';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { AtSign, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const PLATFORM_FEEDS: Record<string, string> = {
  twitter: 'https://x.com/home',
  youtube: 'https://www.youtube.com/feed/subscriptions',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/following',
  linkedin: 'https://www.linkedin.com/feed/',
  facebook: 'https://www.facebook.com/',
  threads: 'https://www.threads.net/',
  reddit: 'https://www.reddit.com/',
  pinterest: 'https://www.pinterest.com/',
};

function TimelinePost({ account, post, onAction }: ConnectedTimelinePostProps) {
  const translate = useTranslations('ui.discovery');
  const actionLabel = (action: NativeSocialAction) =>
    translate(`actions.${action}`);
  const [composer, setComposer] = useState<NativeSocialAction | null>(null);
  const [text, setText] = useState('');
  const [request, setRequest] = useState<SourcePostNativeActionInput | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<NativeSocialAction>>(
    () => new Set(),
  );
  const [isBusy, setBusy] = useState(false);
  const send = async (action: NativeSocialAction) => {
    if (isBusy) return;
    const input = request ?? {
      action,
      credentialId: account.credentialId,
      text: text.trim() || undefined,
      idempotencyKey: crypto.randomUUID(),
    };
    setRequest(input);
    setBusy(true);
    setMessage(null);
    try {
      const result = await onAction(post.id, input);
      if (result.status === 'completed') {
        setCompleted((previous) => new Set([...previous, action]));
        setComposer(null);
        setText('');
        setRequest(null);
        setMessage(`${actionLabel(action)} completed as ${account.label}.`);
      } else {
        setMessage(
          result.message ||
            'The action is awaiting confirmation. Check the source before sending again.',
        );
      }
    } catch {
      setMessage(
        'The action could not be confirmed. Retry confirmation or check the source before sending again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const contentType = post.contentType === 'reel' ? 'video' : post.contentType;
  return (
    <Card bodyClassName="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Avatar className="size-8">
          <AvatarImage src={post.authorAvatarUrl ?? undefined} />
          <AvatarFallback>
            {(post.authorDisplayName || post.authorHandle || '?').slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">
            {post.authorDisplayName || post.authorHandle}
          </p>
          {post.publishedAt ? (
            <p className="text-xs text-muted-foreground">
              {getRelativeTime(post.publishedAt)}
            </p>
          ) : null}
        </div>
      </div>
      {post.text ? (
        <p className="whitespace-pre-wrap break-words text-sm">{post.text}</p>
      ) : null}
      {contentType === 'video' ||
      post.mediaUrls?.length ||
      post.thumbnailUrl ? (
        <SocialMediaPlayer
          contentType={contentType}
          title={post.text?.slice(0, 100) || 'Timeline post'}
          mediaUrl={post.mediaUrls?.[0]}
          thumbnailUrl={post.thumbnailUrl}
          sourceUrl={post.sourceUrl}
        />
      ) : post.sourceUrl ? (
        <a
          href={getSafeExternalUrl(post.sourceUrl) ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground"
        >
          {translate('openSource')}
        </a>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {account.actions.map((action) => (
          <Button
            key={action}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            isDisabled={isBusy || completed.has(action) || Boolean(request)}
            onClick={() => {
              if (['reply', 'quote', 'comment'].includes(action)) {
                setComposer(action);
                setMessage(null);
              } else {
                void send(action);
              }
            }}
          >
            {completed.has(action)
              ? `${actionLabel(action)} complete`
              : actionLabel(action)}
          </Button>
        ))}
      </div>
      {composer ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate('asAccount', {
              action: actionLabel(composer),
              account: account.label,
            })}
          </p>
          <Textarea
            aria-label={`${actionLabel(composer)} text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={account.platform === 'twitter' ? 280 : 2000}
            isDisabled={isBusy || Boolean(request)}
          />
          <div className="flex gap-2">
            <Button
              size={ButtonSize.SM}
              isLoading={isBusy}
              isDisabled={!text.trim() || Boolean(request)}
              onClick={() => {
                void send(composer);
              }}
            >
              {translate('publishAction', {
                action: actionLabel(composer).toLowerCase(),
              })}
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              isDisabled={isBusy || Boolean(request)}
              onClick={() => setComposer(null)}
            >
              {translate('cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
      {request ? (
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          isLoading={isBusy}
          onClick={() => {
            void send(request.action);
          }}
        >
          {translate('confirmation')}
        </Button>
      ) : null}
    </Card>
  );
}

export default function ConnectedTimelines() {
  const translate = useTranslations('ui.discovery');
  const scope = useCollectionScope();
  const brandId = scope.brandId ?? '';
  const { href } = useOrgUrl();
  const client = useQueryClient();
  const getService = useAuthedService((token: string) =>
    SocialTimelinesService.getInstance(token),
  );
  const key = ['social-timelines', scope.organizationId, brandId];
  const query = useQuery({
    queryKey: key,
    enabled: isBrandResourceReady(scope),
    queryFn: async () => (await getService()).read(brandId),
    staleTime: 30000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: async (credentialId?: string) =>
      (await getService()).refresh(brandId, credentialId),
    onSuccess: (data: SocialTimelineResponse) => client.setQueryData(key, data),
  });
  return (
    <>
      <SectionTopbar
        title={translate('following')}
        subtitle={translate('followingDescription')}
        icon={AtSign}
      />
      <Container bodyClassName="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {translate('refreshDescription')}
          </p>
          <div className="flex gap-2">
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            >
              <Link href={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}>
                {translate('connectedAccounts')}
              </Link>
            </Button>
            <Button
              icon={<RefreshCw className="size-4" />}
              size={ButtonSize.SM}
              isLoading={refresh.isPending}
              isDisabled={
                !query.data?.accounts.some(
                  (account) => account.kind !== 'unsupported',
                )
              }
              onClick={() => refresh.mutate(undefined)}
            >
              {translate('refreshFeeds')}
            </Button>
          </div>
        </div>
        {query.isLoading ? (
          <p role="status">{translate('loadingFeeds')}</p>
        ) : null}
        {query.error || refresh.error ? (
          <p role="alert" className="text-sm text-destructive">
            {translate('feedError')}
          </p>
        ) : null}
        {query.data?.accounts.length === 0 ? (
          <Card label={translate('connectAccount')}>
            <p className="text-sm text-muted-foreground">
              {translate('automaticAccounts')}
            </p>
          </Card>
        ) : null}
        <div className="flex snap-x gap-4 overflow-x-auto pb-4">
          {query.data?.accounts.map((account) => (
            <section
              key={account.credentialId}
              aria-label={`${account.platform} ${account.label}`}
              className="flex h-[calc(100dvh-16rem)] min-h-80 w-80 shrink-0 snap-start flex-col rounded-lg border border-border bg-background-secondary"
            >
              <div className="space-y-2 border-b border-border p-4">
                <div className="flex items-center gap-2">
                  {getPlatformIcon(account.platform, 'size-4')}
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {account.label}
                  </h2>
                  <Badge
                    variant={
                      account.status === 'ready'
                        ? 'success'
                        : account.status === 'unsupported' ||
                            account.status === 'not_synced'
                          ? 'ghost'
                          : 'warning'
                    }
                  >
                    {account.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {account.message}
                </p>
                {account.lastSyncedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {translate('updated')}{' '}
                    {getRelativeTime(account.lastSyncedAt)}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  {account.kind !== 'unsupported' ? (
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.GHOST}
                      isDisabled={refresh.isPending}
                      onClick={() => refresh.mutate(account.credentialId)}
                    >
                      {translate('refresh')}
                    </Button>
                  ) : null}
                  {PLATFORM_FEEDS[account.platform] ? (
                    <a
                      href={PLATFORM_FEEDS[account.platform]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground"
                    >
                      {translate('openFeed')}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {account.posts.map((post) => (
                  <TimelinePost
                    key={post.id}
                    account={account}
                    post={post}
                    onAction={async (postId, input) =>
                      (await getService()).act(brandId, postId, input)
                    }
                  />
                ))}
                {!account.posts.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {account.kind === 'unsupported'
                      ? 'Feed access is unavailable through this connection.'
                      : account.status === 'not_synced'
                        ? 'Refresh this feed to load posts.'
                        : 'No saved posts for this feed.'}
                  </p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
