'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { AccountHealthSummary } from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { BrandDetailSocialMediaCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import {
  OAUTH_CONNECT_PLATFORMS,
  type OAuthConnectPlatform,
} from '@ui/constants/oauth-connect-platforms';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const STATE_LABELS: Record<AccountHealthSummary['state'], string> = {
  healthy: 'Healthy',
  not_started: 'Not started',
  risky: 'Risky',
  warming: 'Warming',
};

type SocialConnection = BrandDetailSocialMediaCardProps['connections'][number];

function getConnectionLabel(connection: SocialConnection): string {
  return (
    connection.name ||
    connection.label ||
    connection.handle ||
    connection.platform
  );
}

function getConnectionInitials(connection: SocialConnection): string {
  const label = getConnectionLabel(connection).trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || connection.platform.slice(0, 2).toUpperCase();
}

function ConnectedAccount({ connection }: { connection: SocialConnection }) {
  const label = getConnectionLabel(connection);
  const content = (
    <>
      <span className="relative shrink-0">
        <Avatar className="size-10 bg-background shadow-border">
          {connection.avatarUrl ? (
            <AvatarImage
              src={connection.avatarUrl}
              alt={`${label} profile picture`}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="text-xs font-semibold text-foreground/70">
            {getConnectionInitials(connection)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5 shadow-border-strong">
          <PlatformBadge
            platform={connection.platform}
            showLabel={false}
            className="size-4 justify-center rounded-full p-0"
          />
        </span>
      </span>

      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium">{label}</span>
        {connection.handle ? (
          <span className="block truncate text-xs text-muted-foreground">
            @{connection.handle.replace(/^@/, '')}
          </span>
        ) : null}
      </span>
    </>
  );
  const className =
    'flex min-w-0 items-center gap-3 rounded-md bg-background-secondary px-3 py-2 shadow-border transition-colors hover:bg-background';

  if (!connection.url) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      href={connection.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label} on ${connection.platform}`}
      className={className}
    >
      {content}
    </Link>
  );
}

function getHealthToneClass(summary: AccountHealthSummary): string {
  if (summary.override.isActive) {
    return 'border-info/30 bg-info/10 text-info';
  }

  if (summary.holdPublishing || summary.riskLevel === 'high') {
    return 'border-warning/30 bg-warning/10 text-warning';
  }

  return 'border-success/30 bg-success/10 text-success';
}

function formatHealthDetail(summary: AccountHealthSummary): string {
  if (summary.override.isActive) {
    return 'Manual override active for this account.';
  }

  if (summary.holdPublishing) {
    return summary.holdReason ?? 'Scheduled publishing is held for warmup.';
  }

  return `${summary.signals.publishedPosts} published post${summary.signals.publishedPosts === 1 ? '' : 's'} across ${summary.signals.connectedDays} connected day${summary.signals.connectedDays === 1 ? '' : 's'}.`;
}

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  connectedPlatformsCount,
}: BrandDetailSocialMediaCardProps) {
  const { getToken } = useAuthIdentity();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  const [accountHealth, setAccountHealth] = useState<AccountHealthSummary[]>(
    [],
  );
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [overrideCredentialId, setOverrideCredentialId] = useState<
    string | null
  >(null);
  const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);

  const connectedConnections = connections;
  const connectedPlatforms = useMemo(
    () =>
      new Set(connectedConnections.map((connection) => connection.platform)),
    [connectedConnections],
  );

  const unconnectedPlatforms = useMemo(
    () =>
      OAUTH_CONNECT_PLATFORMS.filter(
        (p) => !connectedPlatforms.has(p.platform),
      ),
    [connectedPlatforms],
  );
  const connectionHealth = useMemo(
    () =>
      connections
        .map((connection) => connection.accountHealth)
        .filter(
          (summary): summary is AccountHealthSummary => summary !== undefined,
        ),
    [connections],
  );
  const healthRows =
    accountHealth.length > 0 ? accountHealth : connectionHealth;
  const selectedOverrideHealth = useMemo(
    () =>
      healthRows.find(
        (summary) => summary.credentialId === overrideCredentialId,
      ) ?? null,
    [healthRows, overrideCredentialId],
  );

  const loadAccountHealth = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId || connectedPlatformsCount === 0) {
        setAccountHealth([]);
        return;
      }

      setIsHealthLoading(true);
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (signal?.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!signal?.aborted) {
          setAccountHealth(summaries);
        }
      } catch (error) {
        if (!signal?.aborted) {
          logger.error('Failed to load account health', error);
        }
      } finally {
        if (!signal?.aborted) {
          setIsHealthLoading(false);
        }
      }
    },
    [brandId, connectedPlatformsCount, getToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountHealth(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadAccountHealth]);

  const handleConnectPlatform = async (platform: string) => {
    try {
      setConnectingPlatform(platform);
      const token = (await resolveAuthToken(getToken)) ?? '';
      const service = new ServicesService(platform, token);
      const credentialOAuth = await service.postConnect({ brand: brandId });
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(`Connect ${platform}`);
      setConnectingPlatform(null);
    }
  };

  const handleConfirmOverride = async () => {
    if (!selectedOverrideHealth) {
      return;
    }

    setIsOverrideSubmitting(true);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      const service = CredentialsService.getInstance(token);
      const updated = await service.overrideAccountHealth(
        selectedOverrideHealth.credentialId,
        {
          confirm: true,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Manual override confirmed from brand social dashboard.',
        },
      );
      setAccountHealth((current) => {
        const withoutUpdated = current.filter(
          (summary) => summary.credentialId !== updated.credentialId,
        );
        return [...withoutUpdated, updated];
      });
      NotificationsService.getInstance().success('Warmup override confirmed');
      setOverrideCredentialId(null);
    } catch (error) {
      logger.error('Failed to confirm account health override', error);
      NotificationsService.getInstance().error('Confirm warmup override');
    } finally {
      setIsOverrideSubmitting(false);
    }
  };

  const renderConnectButton = (item: OAuthConnectPlatform) => {
    return (
      <Button
        key={item.platform}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={() => handleConnectPlatform(item.platform)}
        isLoading={connectingPlatform === item.platform}
        isDisabled={connectingPlatform !== null}
      >
        {item.icon}
        {item.label}
      </Button>
    );
  };

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Social Media</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectedPlatformsCount > 0
                  ? `${connectedPlatformsCount} connected account${connectedPlatformsCount === 1 ? '' : 's'} with ${unconnectedPlatforms.length} platform${unconnectedPlatforms.length === 1 ? '' : 's'} available to add.`
                  : 'Connect your social media accounts to display them here.'}
              </p>
            </div>

            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => setIsDialogOpen(true)}
            >
              {connectedPlatformsCount > 0 ? 'Manage' : 'Connect'}
            </Button>
          </div>

          {connectedConnections.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {connectedConnections.map((connection) => (
                <ConnectedAccount
                  key={connection.credentialId}
                  connection={connection}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-background-secondary px-4 py-5 text-sm text-muted-foreground shadow-border">
              No social accounts connected yet.
            </div>
          )}

          {healthRows.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Account health</h3>
                {isHealthLoading ? (
                  <span className="text-xs text-muted-foreground">
                    Checking
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                {healthRows.map((summary) => (
                  <div
                    className="space-y-2 border-t border-border/70 pt-3 first:border-t-0 first:pt-0"
                    key={summary.credentialId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {summary.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {summary.platform} · score {summary.score}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase ${getHealthToneClass(summary)}`}
                      >
                        {STATE_LABELS[summary.state]}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {formatHealthDetail(summary)}
                    </p>
                    {summary.holdPublishing ? (
                      <Button
                        size={ButtonSize.SM}
                        variant={ButtonVariant.OUTLINE}
                        onClick={() =>
                          setOverrideCredentialId(summary.credentialId)
                        }
                      >
                        Override 24h
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Social Media</DialogTitle>
            <DialogDescription>
              Connect channels for this brand and review the profiles that are
              already linked.
            </DialogDescription>
          </DialogHeader>

          {connectedPlatformsCount > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {connectedConnections.map((connection) => (
                  <ConnectedAccount
                    key={connection.credentialId}
                    connection={connection}
                  />
                ))}
              </div>

              {unconnectedPlatforms.length > 0 ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Add more channels for this brand.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unconnectedPlatforms.map(renderConnectButton)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your social media accounts to display them here.
              </p>
              <div className="flex flex-wrap gap-2">
                {OAUTH_CONNECT_PLATFORMS.map(renderConnectButton)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedOverrideHealth)}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideCredentialId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm warmup override</DialogTitle>
            <DialogDescription>
              This bypasses the account-health publishing hold for 24 hours. Use
              it only after reviewing the platform warmup guidance.
            </DialogDescription>
          </DialogHeader>

          {selectedOverrideHealth ? (
            <div className="space-y-4">
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {selectedOverrideHealth.holdReason ??
                  'This account is currently held by warmup state.'}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  onClick={() => setOverrideCredentialId(null)}
                >
                  Cancel
                </Button>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  isLoading={isOverrideSubmitting}
                  onClick={handleConfirmOverride}
                >
                  Confirm override
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
