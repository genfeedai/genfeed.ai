'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PageScope, SocialConversationType } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  MESSAGES_TYPE_QUERY_PARAM,
} from '@genfeedai/contracts/constants';
import type { SocialInboxQuery } from '@genfeedai/contracts/interfaces';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import type { MessagesOverviewProps } from '@genfeedai/props/messages/messages-overview.props';
import { SocialMessagesService } from '@genfeedai/services/social/messages.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQueries, useQuery } from '@tanstack/react-query';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { AtSign, Inbox, MessageCircle, MessageCircleReply } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The conversation kinds the Inbox filters by, in the Inbox's order. */
const CONVERSATION_KINDS = [
  { icon: MessageCircle, key: 'dms', type: SocialConversationType.DM },
  {
    icon: MessageCircleReply,
    key: 'replies',
    type: SocialConversationType.REPLY,
  },
  { icon: AtSign, key: 'comments', type: SocialConversationType.COMMENT },
] as const;

function inboxRoute(type?: SocialConversationType): string {
  return type
    ? `${APP_ROUTES.MESSAGES.ROOT}?${MESSAGES_TYPE_QUERY_PARAM}=${type}`
    : APP_ROUTES.MESSAGES.ROOT;
}

/**
 * #5502 Messages home: how much is waiting, per conversation kind, with each
 * count opening the Inbox already filtered to that kind.
 */
export default function MessagesOverview({
  scope = PageScope.BRAND,
}: MessagesOverviewProps) {
  const translate = useTranslations('common.messages.overview');
  const { href } = useOrgUrl();
  const { brandId, organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    SocialMessagesService.getInstance(token),
  );
  const isOrganizationScope = scope === PageScope.ORGANIZATION;
  const brandQuery: Pick<SocialInboxQuery, 'allBrands' | 'brandId'> =
    isOrganizationScope ? { allBrands: true } : { brandId };
  const isEnabled =
    Boolean(organizationId) && (isOrganizationScope || Boolean(brandId));

  const unreadQuery = useQuery({
    enabled: isEnabled,
    queryFn: async ({ signal }) =>
      (await getService()).unreadCount(brandQuery, signal),
    queryKey: ['messages-overview', 'unread', organizationId, brandQuery],
  });

  const kindQueries = useQueries({
    queries: CONVERSATION_KINDS.map((kind) => ({
      enabled: isEnabled,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await getService()).listPage(
          {
            ...brandQuery,
            conversationType: kind.type,
            limit: 1,
            status: 'open',
          },
          signal,
        ),
      queryKey: [
        'messages-overview',
        'open',
        kind.type,
        organizationId,
        brandQuery,
      ],
    })),
  });

  const isLoading =
    unreadQuery.isLoading || kindQueries.some((query) => query.isLoading);
  const isError =
    unreadQuery.isError || kindQueries.some((query) => query.isError);
  const openCounts = CONVERSATION_KINDS.map(
    (_kind, index) => kindQueries[index]?.data?.total ?? 0,
  );

  const kpiItems = [
    {
      description: translate('kpi.unreadHelp'),
      isLoading,
      label: translate('kpi.unread'),
      value: unreadQuery.data?.unreadCount ?? 0,
    },
    ...CONVERSATION_KINDS.map((kind, index) => ({
      description: translate('kpi.openHelp'),
      isLoading,
      label: translate(`kinds.${kind.key}`),
      value: openCounts[index] ?? 0,
    })),
  ];

  const cards: OverviewCard[] = [
    {
      color: 'bg-sky-500/12 text-sky-300',
      cta: translate('cards.inbox.cta'),
      description: translate('cards.inbox.description'),
      href: href(inboxRoute()),
      icon: Inbox,
      id: 'inbox',
      label: translate('cards.inbox.label'),
    },
    ...CONVERSATION_KINDS.map(
      (kind, index): OverviewCard => ({
        color: 'bg-violet-500/12 text-violet-300',
        cta: translate('cards.kind.cta', {
          kind: translate(`kinds.${kind.key}`),
        }),
        description: translate('cards.kind.description', {
          count: openCounts[index] ?? 0,
        }),
        href: href(inboxRoute(kind.type)),
        icon: kind.icon,
        id: kind.key,
        label: translate(`kinds.${kind.key}`),
      }),
    ),
  ];

  return (
    <OverviewLayout
      actionsTitle={translate('actionsTitle')}
      cards={cards}
      description={translate('description')}
      header={
        <KPISection
          error={isError ? translate('error') : null}
          gridCols={{ desktop: 4, mobile: 2 }}
          isLoading={isLoading}
          items={kpiItems}
        />
      }
      icon={Inbox}
      label={translate('title')}
    />
  );
}
