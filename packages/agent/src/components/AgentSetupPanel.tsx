'use client';

import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { LayoutGrid } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

interface AgentSetupPanelProps {
  brand: Brand | undefined | null;
  className?: string;
  connectedConnections: AgentSetupConnection[];
  connectedPlatformsCount: number;
  onOAuthConnect?: (platform: string) => void | Promise<void>;
}

function getConnectionLabel(connection: AgentSetupConnection): string {
  return (
    connection.name ||
    connection.label ||
    connection.handle ||
    connection.platform
  );
}

function ConnectedAccountChip({
  connection,
}: {
  connection: AgentSetupConnection;
}): ReactElement {
  const label = getConnectionLabel(connection);

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-card px-2.5 py-1.5 shadow-border">
      <Avatar
        alt={`${label} profile picture`}
        badge={
          <PlatformBadge
            platform={connection.platform}
            showLabel={false}
            variant="solid"
          />
        }
        name={label}
        size="md"
        src={connection.avatarUrl}
      />

      <span className="min-w-0 text-left">
        <span className="block truncate text-xs font-medium text-foreground">
          {label}
        </span>
        {connection.handle ? (
          <span className="block truncate text-2xs text-muted-foreground">
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
 * same OAuth dropdown the workspace already uses.
 */
export function AgentSetupPanel({
  brand,
  className,
  connectedConnections,
  connectedPlatformsCount,
  onOAuthConnect,
}: AgentSetupPanelProps): ReactElement {
  const connectedPlatforms = useMemo(
    () =>
      new Set(connectedConnections.map((connection) => connection.platform)),
    [connectedConnections],
  );

  const hasConnections = connectedPlatformsCount > 0;

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="agent-setup-panel"
    >
      <div className="gen-shell-toolbar shrink-0 p-4">
        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Setup
        </p>
        <h2 className="mt-1 text-base font-semibold text-foreground">
          Finish setting up
        </h2>
        <p className="mt-1 text-xs leading-5 text-foreground/60">
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
            <span className="text-2xs font-semibold text-foreground/60">
              Social channels
            </span>
            <span className="text-2xs font-medium text-muted-foreground">
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
            <div className="mb-3 flex items-center gap-2 rounded-md bg-card px-3 py-2.5 text-2xs text-muted-foreground shadow-border">
              <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
              No channels connected yet.
            </div>
          )}

          <AgentOAuthConnectMenu
            contentAlign="start"
            excludePlatforms={connectedPlatforms}
            onOAuthConnect={onOAuthConnect}
            triggerClassName="w-full justify-center"
            triggerLabel={
              hasConnections ? 'Connect more channels' : 'Connect a channel'
            }
            triggerSize={ButtonSize.SM}
            triggerVariant={ButtonVariant.SECONDARY}
          />
        </Card>
      </div>
    </section>
  );
}
