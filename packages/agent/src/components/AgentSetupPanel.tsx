'use client';

import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  CredentialPlatform,
} from '@genfeedai/enums';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSnapchat,
  FaStar,
  FaThreads,
  FaTiktok,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';

interface AgentSetupPlatform {
  icon: ReactNode;
  label: string;
  platform: CredentialPlatform;
}

/**
 * OAuth-connectable channels offered from the agent setup panel. Mirrors the
 * `OAUTH_PLATFORMS` list/pattern in
 * `packages/pages/brands/components/sidebar/BrandDetailSocialMediaCard.tsx`.
 */
const AGENT_SETUP_PLATFORMS: AgentSetupPlatform[] = [
  {
    icon: <FaXTwitter className="mr-1.5 size-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    icon: <FaTiktok className="mr-1.5 size-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    icon: <FaYoutube className="mr-1.5 size-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    icon: <FaInstagram className="mr-1.5 size-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    icon: <FaStar className="mr-1.5 size-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    icon: <FaFacebook className="mr-1.5 size-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    icon: <FaLinkedin className="mr-1.5 size-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    icon: <FaPinterest className="mr-1.5 size-3.5" />,
    label: 'Pinterest',
    platform: CredentialPlatform.PINTEREST,
  },
  {
    icon: <FaReddit className="mr-1.5 size-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    icon: <FaThreads className="mr-1.5 size-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    icon: <FaWordpress className="mr-1.5 size-3.5" />,
    label: 'WordPress',
    platform: CredentialPlatform.WORDPRESS,
  },
  {
    icon: <FaSnapchat className="mr-1.5 size-3.5" />,
    label: 'Snapchat',
    platform: CredentialPlatform.SNAPCHAT,
  },
  {
    icon: <FaMastodon className="mr-1.5 size-3.5" />,
    label: 'Mastodon',
    platform: CredentialPlatform.MASTODON,
  },
  {
    icon: <FaShopify className="mr-1.5 size-3.5" />,
    label: 'Shopify',
    platform: CredentialPlatform.SHOPIFY,
  },
];

interface AgentSetupPanelProps {
  brand: Brand | undefined | null;
  className?: string;
  connectedConnections: AgentSetupConnection[];
  connectedPlatformsCount: number;
  onOAuthConnect?: (platform: string) => void;
}

function getConnectionLabel(connection: AgentSetupConnection): string {
  return (
    connection.name ||
    connection.label ||
    connection.handle ||
    connection.platform
  );
}

function getConnectionInitials(connection: AgentSetupConnection): string {
  const label = getConnectionLabel(connection).trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || connection.platform.slice(0, 2).toUpperCase();
}

function ConnectedAccountChip({
  connection,
}: {
  connection: AgentSetupConnection;
}): ReactElement {
  const label = getConnectionLabel(connection);

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-background-secondary px-2.5 py-1.5 shadow-border">
      <span className="relative shrink-0">
        <Avatar className="size-8 bg-background shadow-border">
          {connection.avatarUrl ? (
            <AvatarImage
              src={connection.avatarUrl}
              alt={`${label} profile picture`}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="text-[10px] font-semibold text-foreground/70">
            {getConnectionInitials(connection)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5 shadow-border-strong">
          <PlatformBadge
            platform={connection.platform}
            showLabel={false}
            size={ComponentSize.SM}
            className="size-3.5 justify-center rounded-full p-0"
          />
        </span>
      </span>

      <span className="min-w-0 text-left">
        <span className="block truncate text-xs font-medium text-foreground">
          {label}
        </span>
        {connection.handle ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            @{connection.handle.replace(/^@/, '')}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Right-pane setup-progress panel shown in the agent workspace while the active
 * brand is not fully onboarded. Surfaces brand-context completeness and
 * social-channel connection status, and lets the user connect channels via the
 * same OAuth flow the workspace already uses.
 */
export function AgentSetupPanel({
  brand,
  className,
  connectedConnections,
  connectedPlatformsCount,
  onOAuthConnect,
}: AgentSetupPanelProps): ReactElement {
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );

  const connectedPlatforms = useMemo(
    () =>
      new Set(connectedConnections.map((connection) => connection.platform)),
    [connectedConnections],
  );

  const unconnectedPlatforms = useMemo(
    () =>
      AGENT_SETUP_PLATFORMS.filter(
        (item) => !connectedPlatforms.has(item.platform),
      ),
    [connectedPlatforms],
  );

  function handleConnect(platform: string): void {
    if (!onOAuthConnect) {
      return;
    }

    setConnectingPlatform(platform);
    // `onOAuthConnect` typically navigates the current window to the provider,
    // so this component usually unmounts before the promise settles. Reset on
    // failure so the buttons become interactive again if navigation is aborted.
    Promise.resolve(onOAuthConnect(platform)).catch(() => {
      setConnectingPlatform(null);
    });
  }

  const canConnect = Boolean(onOAuthConnect);
  const hasConnections = connectedPlatformsCount > 0;

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="agent-setup-panel"
    >
      <div className="gen-shell-toolbar shrink-0 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
          Setup
        </p>
        <h2 className="mt-1 text-base font-semibold text-foreground">
          Finish setting up
        </h2>
        <p className="mt-1 text-xs leading-5 text-foreground/55">
          Complete your brand context and connect a channel so the agent creates
          on-brand, publishable content.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <BrandCompletenessCard brand={brand ?? {}} />

        <Card
          bodyClassName="gap-0 p-3 sm:p-3"
          data-testid="agent-setup-social-card"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground/60">
              Social channels
            </span>
            <span className="text-[10px] font-medium text-foreground/30">
              {connectedPlatformsCount} connected
            </span>
          </div>

          {hasConnections ? (
            <div className="mb-3 flex flex-col gap-1.5">
              {connectedConnections.map((connection) => (
                <ConnectedAccountChip
                  key={connection.credentialId}
                  connection={connection}
                />
              ))}
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-background-secondary px-3 py-2.5 text-[11px] text-muted-foreground shadow-border">
              <HiOutlineSquares2X2 className="size-4 shrink-0 text-foreground/40" />
              No channels connected yet.
            </div>
          )}

          {canConnect && unconnectedPlatforms.length > 0 ? (
            <div className="border-t border-white/[0.06] pt-2.5">
              <p className="mb-2 text-[10px] text-foreground/30">
                {hasConnections
                  ? 'Connect more channels'
                  : 'Connect a channel to publish'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unconnectedPlatforms.map((item) => (
                  <Button
                    key={item.platform}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    onClick={() => handleConnect(item.platform)}
                    isLoading={connectingPlatform === item.platform}
                    isDisabled={connectingPlatform !== null}
                  >
                    {item.icon}
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}
