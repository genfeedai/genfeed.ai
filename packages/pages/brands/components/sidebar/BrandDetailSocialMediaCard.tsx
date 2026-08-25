'use client';

import { getCurrentSocialWarmupBlueprint } from '@api-types/contracts/social-warmup-blueprint.contract';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { AccountHealthSummary } from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { OAUTH_RETURN_TO_STORAGE_KEY } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import CredentialPostingTimesEditor from '@pages/brands/components/sidebar/CredentialPostingTimesEditor';
import SocialWarmupProgram from '@pages/brands/components/sidebar/social-warmup/SocialWarmupProgram';
import type {
  BrandDetailConnectedAccountProps,
  BrandDetailSocialMediaCardProps,
} from '@props/pages/brand-detail.props';
import type { SocialWarmupOverrideRequest } from '@props/social/social-warmup-program.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import {
  groupOAuthConnectPlatforms,
  OAUTH_CONNECT_PLATFORMS,
  type OAuthConnectPlatform,
  resolveOAuthServicePath,
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
import { Check } from 'lucide-react';
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

function hasWarmupBlueprint(platform: SocialConnection['platform']): boolean {
  return Boolean(getCurrentSocialWarmupBlueprint(platform));
}

function ConnectedAccount({
  connection,
  isSelected = false,
  onSelect,
}: BrandDetailConnectedAccountProps) {
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
  const className = `flex min-w-0 items-center gap-3 rounded-md px-3 py-2 shadow-border transition-colors ${
    isSelected
      ? 'bg-background ring-1 ring-primary/40'
      : 'bg-background-secondary hover:bg-background'
  }`;

  const profileLink = connection.url ? (
    <Link
      href={connection.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label} on ${connection.platform}`}
      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      {`Open ${label}`}
    </Link>
  ) : null;

  if (onSelect) {
    return (
      <div className={`${className} justify-between`}>
        <Button
          aria-pressed={isSelected}
          className="min-w-0 flex-1 justify-start gap-3 p-0"
          onClick={() => onSelect(connection.credentialId)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {content}
        </Button>
        {profileLink}
      </div>
    );
  }

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

  if (summary.signals.accountAgeStatus === 'STALE') {
    return 'Platform account-age evidence is stale. Reconnect to refresh readiness checks.';
  }

  if (summary.signals.accountAgeStatus === 'FAILED') {
    return 'Platform account-age check failed. Missing or stale evidence is tracked separately.';
  }

  if (summary.signals.accountAgeStatus === 'MISSING') {
    return `${summary.signals.publishedPosts} published post${summary.signals.publishedPosts === 1 ? '' : 's'}. Native social-account age is not yet verified by the platform.`;
  }

  return `${summary.signals.publishedPosts} published post${summary.signals.publishedPosts === 1 ? '' : 's'} across ${summary.signals.connectedDays} connected day${summary.signals.connectedDays === 1 ? '' : 's'}.`;
}

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  connectedPlatformsCount,
  onRefresh,
  variant = 'compact',
}: BrandDetailSocialMediaCardProps) {
  const isPageVariant = variant === 'page';
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
  const [overrideUnresolvedChecks, setOverrideUnresolvedChecks] = useState<
    SocialWarmupOverrideRequest['unresolvedChecks']
  >([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<
    string | null
  >(null);
  const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] =
    useState<SocialConnection | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const connectedConnections = connections;
  // Every channel stays on the connect list even once it holds an account: a
  // brand runs as many accounts per platform as it wants, so filtering the
  // connected ones out would hide the way to add the second one.
  const allPlatformGroups = useMemo(
    () => groupOAuthConnectPlatforms(OAUTH_CONNECT_PLATFORMS),
    [],
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
  const supportedConnections = useMemo(
    () =>
      connectedConnections.filter((connection) =>
        hasWarmupBlueprint(connection.platform),
      ),
    [connectedConnections],
  );
  const selectedConnection = useMemo(() => {
    const explicit =
      connectedConnections.find(
        (connection) => connection.credentialId === selectedCredentialId,
      ) ?? null;
    if (explicit) {
      return explicit;
    }

    return supportedConnections[0] ?? connectedConnections[0] ?? null;
  }, [connectedConnections, selectedCredentialId, supportedConnections]);
  const selectedHealth = useMemo(
    () =>
      healthRows.find(
        (summary) => summary.credentialId === selectedConnection?.credentialId,
      ),
    [healthRows, selectedConnection?.credentialId],
  );
  const selectedHasWarmup = selectedConnection
    ? hasWarmupBlueprint(selectedConnection.platform)
    : false;

  function handleOverrideRequest(request: SocialWarmupOverrideRequest) {
    setOverrideCredentialId(request.credentialId);
    setOverrideUnresolvedChecks(request.unresolvedChecks);
  }

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

  const handleConnectPlatform = async (item: OAuthConnectPlatform) => {
    const platform = item.platform;
    try {
      setConnectingPlatform(platform);
      const token = (await resolveAuthToken(getToken)) ?? '';
      // Mirror usePlatformOAuthConnect: provider redirects drop query params, so
      // /oauth/[platform] reads return_to from sessionStorage after verify.
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(
            OAUTH_RETURN_TO_STORAGE_KEY,
            `${window.location.pathname}${window.location.search}`,
          );
        }
      } catch {
        // Private mode — best-effort only.
      }
      const service = new ServicesService(
        resolveOAuthServicePath(platform, item.servicePath),
        token,
      );
      const credentialOAuth = await service.postConnect({ brandId });
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(`Connect ${item.label}`);
      setConnectingPlatform(null);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      await CredentialsService.getInstance(token).delete(
        disconnectTarget.credentialId,
      );
      NotificationsService.getInstance().success('Account disconnected');
      setDisconnectTarget(null);
      // The connection list is owned by the page, so the removed row only
      // disappears once the brand is reloaded.
      await onRefresh?.();
    } catch (error) {
      logger.error('Failed to disconnect account', error);
      NotificationsService.getInstance().error('Disconnect account');
    } finally {
      setIsDisconnecting(false);
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
    const connectKey = item.connectId ?? item.platform;
    const { Icon } = item;

    return (
      <Button
        key={connectKey}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={() => handleConnectPlatform(item)}
        isLoading={connectingPlatform === item.platform}
        isDisabled={connectingPlatform !== null}
      >
        <Icon className={`mr-1.5 size-3.5 ${item.iconClassName}`} />
        {item.label}
      </Button>
    );
  };

  const connectionsByPlatform = useMemo(() => {
    const map = new Map<string, SocialConnection[]>();
    for (const connection of connectedConnections) {
      const key = connection.platform;
      const existing = map.get(key) ?? [];
      existing.push(connection);
      map.set(key, existing);
    }
    return map;
  }, [connectedConnections]);

  const renderIntegrationCard = (item: OAuthConnectPlatform) => {
    const platformConnections = connectionsByPlatform.get(item.platform) ?? [];
    const isConnected = platformConnections.length > 0;
    // The tile owns its brand mark: YouTube Ads and Google Ads share the
    // GOOGLE_ADS credential, so resolving the icon from the platform drew a
    // Google "G" on the YouTube Ads card.
    const { Icon } = item;

    return (
      <div
        key={item.connectId ?? item.platform}
        className="flex h-full flex-col gap-3 rounded-lg bg-background-secondary p-4 shadow-border"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-background shadow-border">
              {/* Square tile: force SVG to a fixed box so FA 448×512 glyphs center. */}
              <span className="inline-flex size-4 items-center justify-center overflow-hidden leading-none [&_svg]:block [&_svg]:size-4">
                <Icon
                  className={`block size-4 shrink-0 ${item.iconClassName}`}
                />
              </span>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {isConnected
                  ? `${platformConnections.length} connected`
                  : 'Not connected'}
              </p>
            </div>
          </div>
          {isConnected ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-success/30 bg-success/10 px-2 py-0.5 text-2xs font-semibold uppercase text-success">
              <Check className="size-3" />
              Linked
            </span>
          ) : null}
        </div>

        {isConnected ? (
          <div className="space-y-3">
            {platformConnections.map((connection) => (
              <div className="space-y-2" key={connection.credentialId}>
                <ConnectedAccount
                  connection={connection}
                  isSelected={
                    selectedConnection?.credentialId === connection.credentialId
                  }
                  onSelect={
                    hasWarmupBlueprint(connection.platform)
                      ? setSelectedCredentialId
                      : undefined
                  }
                />
                {/* Per account, not per platform: reconnecting one account of
                    a brand that runs several must not touch its siblings. */}
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    className="h-7 px-2 text-2xs"
                    onClick={() => handleConnectPlatform(item)}
                    isDisabled={connectingPlatform !== null}
                  >
                    {`Reconnect ${getConnectionLabel(connection)}`}
                  </Button>
                  <Button
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    className="h-7 px-2 text-2xs text-muted-foreground"
                    onClick={() => setDisconnectTarget(connection)}
                  >
                    {`Disconnect ${getConnectionLabel(connection)}`}
                  </Button>
                </div>
                {isPageVariant ? (
                  <CredentialPostingTimesEditor
                    credentialId={connection.credentialId}
                    initialTimes={connection.postingTimes}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          {/* Stays available after the first account connects — that is how a
              brand adds the second one. */}
          <Button
            variant={
              isConnected ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
            }
            size={ButtonSize.SM}
            className="h-8 w-full text-xs"
            onClick={() => handleConnectPlatform(item)}
            isLoading={connectingPlatform === item.platform}
            isDisabled={connectingPlatform !== null}
          >
            {isConnected
              ? `Add another ${item.label} account`
              : `Connect ${item.label}`}
          </Button>
        </div>
      </div>
    );
  };

  const compactUnsupportedHealth = healthRows.filter(
    (summary) =>
      !hasWarmupBlueprint(summary.platform) ||
      summary.credentialId !== selectedConnection?.credentialId,
  );

  const accountHealthSection =
    healthRows.length > 0 || selectedHasWarmup ? (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Account health
          </h3>
          {isHealthLoading ? (
            <span className="text-xs text-muted-foreground">Checking</span>
          ) : null}
        </div>
        {selectedConnection && selectedHasWarmup ? (
          <SocialWarmupProgram
            connection={selectedConnection}
            health={selectedHealth}
            onOverrideRequest={handleOverrideRequest}
            onReconnect={(platform) => {
              const item = OAUTH_CONNECT_PLATFORMS.find(
                (entry) => entry.platform === platform,
              );
              if (item) {
                void handleConnectPlatform(item);
              }
            }}
            variant={isPageVariant ? 'page' : 'compact'}
          />
        ) : null}
        {compactUnsupportedHealth.length > 0 ? (
          <div className="space-y-2">
            {compactUnsupportedHealth.map((summary) => (
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
                    className={`shrink-0 rounded-sm border px-2 py-1 text-2xs font-semibold uppercase ${getHealthToneClass(summary)}`}
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
                    variant={ButtonVariant.SECONDARY}
                    className="h-8 text-xs"
                    onClick={() => {
                      setOverrideUnresolvedChecks([]);
                      setOverrideCredentialId(summary.credentialId);
                    }}
                  >
                    Override 24h
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  const socialDescription =
    connectedPlatformsCount > 0
      ? `${connectedPlatformsCount} connected account${
          connectedPlatformsCount === 1 ? '' : 's'
        } · ${OAUTH_CONNECT_PLATFORMS.length} channels available`
      : 'Connect accounts to display them here.';

  const disconnectDialog = (
    <Dialog
      open={Boolean(disconnectTarget)}
      onOpenChange={(open) => {
        if (!open) {
          setDisconnectTarget(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect account</DialogTitle>
          <DialogDescription>
            {disconnectTarget
              ? `${getConnectionLabel(disconnectTarget)} stops publishing for this brand. Other accounts on ${disconnectTarget.platform} are untouched, and you can reconnect it later.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            onClick={() => setDisconnectTarget(null)}
          >
            Cancel
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
            isLoading={isDisconnecting}
            onClick={handleConfirmDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const overrideDialog = (
    <Dialog
      open={Boolean(selectedOverrideHealth)}
      onOpenChange={(open) => {
        if (!open) {
          setOverrideCredentialId(null);
          setOverrideUnresolvedChecks([]);
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
            {selectedOverrideHealth.override.reason ||
            selectedOverrideHealth.override.expiresAt ? (
              <p className="text-xs text-muted-foreground">
                {selectedOverrideHealth.override.reason}
                {selectedOverrideHealth.override.expiresAt
                  ? ` · expires ${selectedOverrideHealth.override.expiresAt}`
                  : ''}
              </p>
            ) : null}
            {overrideUnresolvedChecks.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {overrideUnresolvedChecks.map((check) => (
                  <li key={check.id}>{check.title}</li>
                ))}
              </ul>
            ) : null}
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
  );

  if (isPageVariant) {
    return (
      <>
        <div className="space-y-6">
          {allPlatformGroups.map((group) => (
            <section key={group.id} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.platforms.map(renderIntegrationCard)}
              </div>
            </section>
          ))}

          {accountHealthSection ? (
            <Card label="Account health" description="Warmup and risk signals.">
              {accountHealthSection}
            </Card>
          ) : null}
        </div>
        {disconnectDialog}
        {overrideDialog}
      </>
    );
  }

  return (
    <>
      <Card
        label="Connected accounts"
        description={socialDescription}
        headerAction={
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={() => setIsDialogOpen(true)}
          >
            {connectedPlatformsCount > 0 ? 'Manage' : 'Connect'}
          </Button>
        }
      >
        {connectedConnections.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectedConnections.map((connection) => (
              <ConnectedAccount
                key={connection.credentialId}
                connection={connection}
                isSelected={
                  selectedConnection?.credentialId === connection.credentialId
                }
                onSelect={
                  hasWarmupBlueprint(connection.platform)
                    ? setSelectedCredentialId
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-background-secondary/50 px-3 py-3 text-xs text-muted-foreground">
            No social accounts connected yet.
          </div>
        )}

        {accountHealthSection ? (
          <div className="border-t border-border pt-3">
            {accountHealthSection}
          </div>
        ) : null}
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
                  <div className="space-y-1" key={connection.credentialId}>
                    <ConnectedAccount connection={connection} />
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      className="h-7 px-2 text-2xs text-muted-foreground"
                      onClick={() => setDisconnectTarget(connection)}
                    >
                      {`Disconnect ${getConnectionLabel(connection)}`}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  Add another account, or a new channel, for this brand.
                </p>
                {allPlatformGroups.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.platforms.map(renderConnectButton)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your social media accounts to display them here.
              </p>
              {allPlatformGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.platforms.map(renderConnectButton)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {disconnectDialog}
      {overrideDialog}
    </>
  );
}
