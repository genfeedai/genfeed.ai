'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { SocialMessagesService } from '@genfeedai/services/social/messages.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import { useLocalDayClock } from '@ui/lists/thread-list/ThreadList';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { useLocale, useTranslations } from 'next-intl';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import { RailPreviewLinkRow, RailPreviewState } from './rail-preview-parts';

const PREVIEW_LIMIT = 5;

/** Messages: the latest conversations, unread ones in bold. */
export default function MessagesRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.messages');
  const locale = useLocale();
  const now = useLocalDayClock();
  const { brandId } = useBrand();
  const conversations = useAuthedQuery<
    SocialMessagesService,
    Awaited<ReturnType<SocialMessagesService['listPage']>>
  >({
    queryFn: (service, signal) =>
      service.listPage(
        {
          limit: PREVIEW_LIMIT,
          ...(brandId ? { brandId } : { allBrands: true }),
        },
        signal,
      ),
    queryKey: ['app-rail-preview', 'messages', brandId || null],
    service: (token: string) => SocialMessagesService.getInstance(token),
    staleTime: 30_000,
  });
  const items = conversations.data?.items ?? [];

  return (
    <RailPreviewState
      emptyLabel={translate('empty')}
      isEmpty={items.length === 0}
      isError={conversations.isError}
      isLoading={conversations.isPending}
    >
      <ul>
        {items.map((conversation) => {
          const name =
            conversation.participantName ||
            conversation.participantHandle ||
            translate('unknown');
          return (
            <RailPreviewLinkRow
              href={href}
              key={conversation.id}
              leading={
                <Avatar
                  name={name}
                  size="sm"
                  src={conversation.participantAvatarUrl}
                />
              }
              subtitle={conversation.latestMessageText}
              title={name}
              trailing={
                conversation.unreadCount > 0 ? (
                  <Badge
                    aria-label={translate('unread', {
                      count: conversation.unreadCount,
                    })}
                    isSolid
                    shape="pill"
                    size="sm"
                    value={conversation.unreadCount}
                    variant="info"
                  />
                ) : (
                  formatThreadTime(
                    conversation.latestMessageAt ?? conversation.updatedAt,
                    locale,
                    now,
                  )
                )
              }
            />
          );
        })}
      </ul>
    </RailPreviewState>
  );
}
