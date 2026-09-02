'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import type {
  PlatformConnectionHealth,
  PlatformHomeContentProps,
} from '@genfeedai/props/pages/platform-home.props';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { logger } from '@services/core/logger.service';
import { EmptyStateCard } from '@ui/card/EmptyState';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Calendar,
  ChartColumn,
  List,
  MessageCircleReply,
  MessageSquare,
  Plug,
  Radio,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  buildPlatformHomeDestinations,
  filterConnectionsForPlatform,
  getPlatformConnectionHealth,
} from './platform-home.helpers';

const HEALTH_BADGE_VARIANT: Record<
  PlatformConnectionHealth,
  'success' | 'warning' | 'info'
> = {
  attention: 'warning',
  connected: 'info',
  healthy: 'success',
};

export default function PlatformHomePage({
  platform,
}: PlatformHomeContentProps) {
  const translate = useTranslations('pages.platforms.home');
  const { href } = useOrgUrl();
  const { brand, brandId, hasBrandId, isLoading, socialConnections } =
    useBrandDetail();
  const connectPlatform = usePlatformOAuthConnect({ brandId });
  const [isConnecting, setIsConnecting] = useState(false);
  const platformLabel = formatPlatformLabel(platform) ?? platform;

  const connections = useMemo(
    () => filterConnectionsForPlatform(socialConnections, platform),
    [platform, socialConnections],
  );

  const destinations = useMemo(
    () => buildPlatformHomeDestinations(platform, brandId),
    [brandId, platform],
  );

  async function handleConnect() {
    setIsConnecting(true);
    try {
      await connectPlatform(platform);
    } catch (error) {
      logger.error('Platform home OAuth connect failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : translate('empty.connect', { platform: platformLabel }),
      );
      setIsConnecting(false);
    }
  }

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <p className="text-sm text-muted-foreground">
          {translate('brandMissing')}
        </p>
      </Container>
    );
  }

  const [primaryConnection] = connections;
  if (!primaryConnection) {
    return (
      <Container
        label={translate('title', { platform: platformLabel })}
        description={translate('description', { platform: platformLabel })}
      >
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <EmptyStateCard
            title={translate('empty.title', { platform: platformLabel })}
            description={translate('empty.description')}
            icon={Plug}
            action={{
              label: translate('empty.connect', { platform: platformLabel }),
              onClick: () => {
                if (!isConnecting) {
                  void handleConnect();
                }
              },
            }}
          />
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            withWrapper={false}
          >
            <Link href={href(destinations.settingsSocial)}>
              {translate('empty.manage')}
            </Link>
          </Button>
        </div>
      </Container>
    );
  }

  const primaryHealth = getPlatformConnectionHealth(primaryConnection);
  const primaryAccount =
    primaryConnection.handle ||
    primaryConnection.name ||
    primaryConnection.label ||
    translate('connection.unnamedAccount');
  const connectionDescription =
    primaryHealth === 'attention'
      ? translate('connection.descriptionAttention', {
          account: primaryAccount,
        })
      : primaryHealth === 'healthy'
        ? translate('connection.descriptionHealthy', {
            account: primaryAccount,
          })
        : translate('connection.descriptionConnected', {
            account: primaryAccount,
          });

  const cards: OverviewCard[] = [
    {
      color: 'bg-emerald-500/12 text-emerald-300',
      cta: translate('connection.cta'),
      description: connectionDescription,
      href: href(destinations.settingsSocial),
      icon: Plug,
      id: 'connection',
      label: translate('connection.label'),
    },
    {
      color: 'bg-violet-500/12 text-violet-300',
      cta: translate('create.cta', { platform: platformLabel }),
      description: translate('create.description', { platform: platformLabel }),
      href: href(destinations.create),
      icon: Sparkles,
      id: 'create',
      label: translate('create.label'),
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: translate('queue.cta'),
      description: translate('queue.description', { platform: platformLabel }),
      href: href(destinations.queue),
      icon: List,
      id: 'queue',
      label: translate('queue.label'),
    },
    {
      color: 'bg-sky-500/12 text-sky-300',
      cta: translate('calendar.cta'),
      description: translate('calendar.description'),
      href: href(destinations.calendar),
      icon: Calendar,
      id: 'calendar',
      label: translate('calendar.label'),
    },
    {
      color: 'bg-pink-500/12 text-pink-300',
      cta: translate('engage.cta'),
      description: translate('engage.description'),
      href: href(destinations.messages),
      icon: MessageSquare,
      id: 'engage',
      label: translate('engage.label'),
    },
  ];

  if (destinations.replies) {
    cards.push({
      color: 'bg-orange-500/12 text-orange-300',
      cta: translate('replies.cta'),
      description: translate('replies.description', {
        platform: platformLabel,
      }),
      href: href(destinations.replies),
      icon: MessageCircleReply,
      id: 'replies',
      label: translate('replies.label'),
    });
  }

  if (destinations.live) {
    cards.push({
      color: 'bg-red-500/12 text-red-300',
      cta: translate('live.cta'),
      description: translate('live.description', { platform: platformLabel }),
      href: href(destinations.live),
      icon: Radio,
      id: 'live',
      label: translate('live.label'),
    });
  }

  cards.push({
    color: 'bg-blue-500/12 text-blue-300',
    cta: translate('winners.cta'),
    description: translate('winners.description', { platform: platformLabel }),
    href: href(destinations.analytics),
    icon: ChartColumn,
    id: 'winners',
    label: translate('winners.label'),
  });

  return (
    <OverviewLayout
      label={translate('title', { platform: platformLabel })}
      description={translate('description', { platform: platformLabel })}
      actionsTitle={translate('actionsTitle')}
      cards={cards}
      header={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <PlatformBadge platform={platform} />
            <p className="text-sm text-muted-foreground">
              {translate('accountsLabel')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connections.map((connection) => {
              const health = getPlatformConnectionHealth(connection);
              const account =
                connection.handle ||
                connection.name ||
                connection.label ||
                translate('connection.unnamedAccount');

              return (
                <div
                  className="gen-glass flex items-center gap-2 rounded-lg px-3 py-2"
                  key={connection.credentialId}
                >
                  <span className="text-sm text-foreground">{account}</span>
                  <Badge variant={HEALTH_BADGE_VARIANT[health]}>
                    {health === 'attention'
                      ? translate('connection.healthAttention')
                      : health === 'healthy'
                        ? translate('connection.healthHealthy')
                        : translate('connection.healthConnected')}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
