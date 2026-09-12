'use client';

import {
  ButtonSize,
  ButtonVariant,
  type CredentialPlatform,
} from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOAuthConnectPlatforms } from '@hooks/auth/use-oauth-connect-platforms/use-oauth-connect-platforms';
import { OAUTH_RETURN_TO_STORAGE_KEY } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import AccountAvatar from '@pages/brands/components/integrations/AccountAvatar';
import AccountsTable from '@pages/brands/components/integrations/AccountsTable';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
  hasWarmupBlueprint,
  STATE_MESSAGE_KEYS,
} from '@pages/brands/components/integrations/account-connection-status.util';
import ConnectAccountModal from '@pages/brands/components/integrations/ConnectAccountModal';
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
  type ResolvedOAuthConnectPlatform,
  resolveOAuthServicePath,
} from '@ui/constants/oauth-connect-platforms';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SocialConnection = BrandDetailSocialMediaCardProps['connections'][number];

/**
 * The fields `handleConnectPlatform` actually reads. Kept narrow (rather
 * than the full `ResolvedOAuthConnectPlatform`) so the same handler accepts
 * both a real catalog entry and `ConnectAccountModal`'s structurally
 * equivalent (but independently declared, to avoid a props->ui package
 * cycle — see `ConnectPlatformReadiness`) platform type.
 */
type ConnectablePlatform = Pick<
  ResolvedOAuthConnectPlatform,
  'isConnectAvailable' | 'label' | 'platform' | 'servicePath'
>;

function ConnectedAccount({
  connection,
  isSelected = false,
  onSelect,
}: BrandDetailConnectedAccountProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const label = getConnectionLabel(connection);
  const needsReconnect =
    getAccountConnectionStatus(connection) === 'needsReconnect';
  const content = (
    <>
      <AccountAvatar connection={connection} size="md" />

      <span className="min-w-0 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="block truncate text-sm font-medium">{label}</span>
          {needsReconnect ? (
            <span
              aria-label={translate('needsReconnect')}
              className="gen-dot gen-dot-warning shrink-0"
              role="img"
              title={translate('needsReconnect')}
            />
          ) : null}
        </span>
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
      aria-label={translate('openProfileAria', {
        account: label,
        platform: connection.platform,
      })}
      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      {translate('openProfile', { account: label })}
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
      aria-label={translate('openProfileAria', {
        account: label,
        platform: connection.platform,
      })}
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

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  onRefresh,
  variant = 'compact',
}: BrandDetailSocialMediaCardProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const isPageVariant = variant === 'page';
  const { getToken } = useAuthIdentity();
  const oauthConnectPlatforms = useOAuthConnectPlatforms();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  // Distinct from `connectingPlatform`: that one drives the header/modal's
  // *new-account* connect controls (no credential exists yet, so platform
  // is the only key available). Reconnect always targets one existing
  // credential, so its disablement must key off credentialId — otherwise
  // reconnecting one account disables Reconnect for every other account on
  // the same platform.
  const [reconnectingCredentialId, setReconnectingCredentialId] = useState<
    string | null
  >(null);
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
  const [postingTimesTarget, setPostingTimesTarget] =
    useState<SocialConnection | null>(null);

  const connectedConnections = connections;
  const hasVisibleConnections = connectedConnections.length > 0;
  // Every channel stays on the connect list even once it holds an account: a
  // brand runs as many accounts per platform as it wants, so filtering the
  // connected ones out would hide the way to add the second one.
  const allPlatformGroups = useMemo(
    () => groupOAuthConnectPlatforms(oauthConnectPlatforms),
    [oauthConnectPlatforms],
  );
  const unavailablePlatforms = useMemo(
    () =>
      new Set<CredentialPlatform>(
        oauthConnectPlatforms
          .filter((item) => !item.isConnectAvailable)
          .map((item) => item.platform),
      ),
    [oauthConnectPlatforms],
  );
  const platformConnectedCounts = useMemo(() => {
    const counts: Partial<Record<CredentialPlatform, number>> = {};
    for (const connection of connectedConnections) {
      if (getAccountConnectionStatus(connection) !== 'connected') {
        continue;
      }
      counts[connection.platform] = (counts[connection.platform] ?? 0) + 1;
    }
    return counts;
  }, [connectedConnections]);
  // The header count and the compact card's own description must agree with
  // what each row actually shows — a lapsed or identity-less credential
  // does not count as connected just because `isConnected` is still true.
  const compactConnectedCount = useMemo(
    () =>
      connectedConnections.filter(
        (connection) => getAccountConnectionStatus(connection) === 'connected',
      ).length,
    [connectedConnections],
  );
  // Distinct from `hasVisibleConnections`: a lapsed-only brand has a
  // visible row (so the "Manage" dialog can still show and let the user
  // disconnect or reconnect it) but zero connected accounts — the
  // at-a-glance button label and the card's own empty state must agree
  // with the "N connected accounts" description below, not with whether
  // any row happens to be visible.
  const hasConnectedAccounts = compactConnectedCount > 0;
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

  function formatHealthDetail(summary: AccountHealthSummary): string {
    if (summary.override.isActive) {
      return translate('health.overrideActive');
    }

    if (summary.holdPublishing) {
      return summary.holdReason ?? translate('health.publishingHeld');
    }

    if (summary.signals.accountAgeStatus === 'STALE') {
      return translate('health.accountAgeStale');
    }

    if (summary.signals.accountAgeStatus === 'FAILED') {
      return translate('health.accountAgeFailed');
    }

    if (summary.signals.accountAgeStatus === 'MISSING') {
      return translate('health.accountAgeMissing', {
        publishedPosts: summary.signals.publishedPosts,
      });
    }

    return translate('health.accountAgeVerified', {
      connectedDays: summary.signals.connectedDays,
      publishedPosts: summary.signals.publishedPosts,
    });
  }

  function handleOverrideRequest(request: SocialWarmupOverrideRequest) {
    setOverrideCredentialId(request.credentialId);
    setOverrideUnresolvedChecks(request.unresolvedChecks);
  }

  const loadAccountHealth = useCallback(
    async (signal?: AbortSignal) => {
      // Gate on any visible row, not the connected count: a connected
      // credential with an expired token or a legacy identity-less row is
      // exactly the case where fetched health would explain the breakage,
      // and both read as 0 connected while still being a visible account.
      if (!brandId || connections.length === 0) {
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
    [brandId, connections.length, getToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountHealth(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadAccountHealth]);

  const handleConnectPlatform = async (
    item: ConnectablePlatform,
    credentialId?: string,
  ) => {
    if (!item.isConnectAvailable) {
      return;
    }

    const platform = item.platform;
    try {
      setConnectingPlatform(platform);
      if (credentialId) {
        setReconnectingCredentialId(credentialId);
      }
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
      // A reconnect carries the existing credentialId so the server re-links
      // the same row instead of minting a duplicate connected account.
      const credentialOAuth = await service.postConnect(
        credentialId ? { brandId, credentialId } : { brandId },
      );
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(
        translate('connectPlatform', { platform: item.label }),
      );
      setConnectingPlatform(null);
      setReconnectingCredentialId(null);
    }
  };

  const handleReconnect = (connection: SocialConnection) => {
    const item = oauthConnectPlatforms.find(
      (entry) => entry.platform === connection.platform,
    );
    if (item) {
      void handleConnectPlatform(item, connection.credentialId);
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
      NotificationsService.getInstance().success(
        translate('accountDisconnected'),
      );
      setDisconnectTarget(null);
      // The connection list is owned by the page, so the removed row only
      // disappears once the brand is reloaded.
      await onRefresh?.();
    } catch (error) {
      logger.error('Failed to disconnect account', error);
      NotificationsService.getInstance().error(translate('disconnectAccount'));
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
          reason: translate('overrideReason'),
        },
      );
      setAccountHealth((current) => {
        const withoutUpdated = current.filter(
          (summary) => summary.credentialId !== updated.credentialId,
        );
        return [...withoutUpdated, updated];
      });
      NotificationsService.getInstance().success(
        translate('overrideConfirmed'),
      );
      setOverrideCredentialId(null);
    } catch (error) {
      logger.error('Failed to confirm account health override', error);
      NotificationsService.getInstance().error(
        translate('confirmWarmupOverride'),
      );
    } finally {
      setIsOverrideSubmitting(false);
    }
  };

  const renderConnectButton = (item: ResolvedOAuthConnectPlatform) => {
    const connectKey = item.connectId ?? item.platform;
    const { Icon } = item;

    return (
      <Button
        key={connectKey}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={() => handleConnectPlatform(item)}
        isLoading={connectingPlatform === item.platform}
        isDisabled={!item.isConnectAvailable || connectingPlatform !== null}
      >
        <Icon className={`mr-1.5 size-3.5 ${item.iconClassName}`} />
        {item.label}
      </Button>
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
            {translate('accountHealth')}
          </h3>
          {isHealthLoading ? (
            <span className="text-xs text-muted-foreground">
              {translate('checking')}
            </span>
          ) : null}
        </div>
        {selectedConnection && selectedHasWarmup ? (
          <SocialWarmupProgram
            connection={selectedConnection}
            health={selectedHealth}
            onOverrideRequest={handleOverrideRequest}
            onReconnect={(platform) => {
              const item = oauthConnectPlatforms.find(
                (entry) => entry.platform === platform,
              );
              if (item) {
                void handleConnectPlatform(item);
              }
            }}
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
                      {translate('score', {
                        platform: summary.platform,
                        score: summary.score,
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-sm border px-2 py-1 text-2xs font-semibold uppercase ${getHealthToneClass(summary)}`}
                  >
                    {translate(STATE_MESSAGE_KEYS[summary.state])}
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
                    {translate('override24h')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  const socialDescription = hasVisibleConnections
    ? translate('channelAvailability', {
        channelCount: oauthConnectPlatforms.length,
        connectedCount: compactConnectedCount,
      })
    : translate('connectAccountsDescription');

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
          <DialogTitle>{translate('disconnectAccount')}</DialogTitle>
          <DialogDescription>
            {disconnectTarget
              ? translate('disconnectAccountDescription', {
                  account: getConnectionLabel(disconnectTarget),
                  platform: disconnectTarget.platform,
                })
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            onClick={() => setDisconnectTarget(null)}
          >
            {translate('cancel')}
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
            isLoading={isDisconnecting}
            onClick={handleConfirmDisconnect}
          >
            {translate('disconnect')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const postingTimesDialog = (
    <Dialog
      open={Boolean(postingTimesTarget)}
      onOpenChange={(open) => {
        if (!open) {
          setPostingTimesTarget(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {postingTimesTarget
              ? translate('postingTimesDialogTitle', {
                  account: getConnectionLabel(postingTimesTarget),
                })
              : translate('postingTimes')}
          </DialogTitle>
        </DialogHeader>

        {postingTimesTarget ? (
          <CredentialPostingTimesEditor
            credentialId={postingTimesTarget.credentialId}
            initialTimes={postingTimesTarget.postingTimes}
          />
        ) : null}
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
          <DialogTitle>{translate('confirmWarmupOverride')}</DialogTitle>
          <DialogDescription>
            {translate('overrideDescription')}
          </DialogDescription>
        </DialogHeader>

        {selectedOverrideHealth ? (
          <div className="space-y-4">
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              {selectedOverrideHealth.holdReason ??
                translate('accountHeldByWarmup')}
            </div>
            {selectedOverrideHealth.override.reason ||
            selectedOverrideHealth.override.expiresAt ? (
              <p className="text-xs text-muted-foreground">
                {selectedOverrideHealth.override.reason}
                {selectedOverrideHealth.override.expiresAt
                  ? translate('expires', {
                      time: selectedOverrideHealth.override.expiresAt,
                    })
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
                {translate('cancel')}
              </Button>
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                isLoading={isOverrideSubmitting}
                onClick={handleConfirmOverride}
              >
                {translate('confirmOverride')}
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
        <AccountsTable
          accountHealth={healthRows}
          connections={connectedConnections}
          onConnectAccount={() => setIsConnectAccountModalOpen(true)}
          onDisconnect={setDisconnectTarget}
          onPostingTimes={setPostingTimesTarget}
          onReconnect={handleReconnect}
          reconnectingCredentialId={reconnectingCredentialId}
          unavailablePlatforms={unavailablePlatforms}
        />

        <ConnectAccountModal
          connectingPlatform={connectingPlatform}
          onConnect={(item) => void handleConnectPlatform(item)}
          onOpenChange={setIsConnectAccountModalOpen}
          open={isConnectAccountModalOpen}
          platformConnectedCounts={platformConnectedCounts}
          platformGroups={allPlatformGroups}
        />

        {disconnectDialog}
        {postingTimesDialog}
      </>
    );
  }

  return (
    <>
      <Card
        label={translate('connectedAccounts')}
        description={socialDescription}
        headerAction={
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={() => setIsDialogOpen(true)}
          >
            {hasConnectedAccounts ? translate('manage') : translate('connect')}
          </Button>
        }
      >
        {hasConnectedAccounts ? (
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
            {translate('empty')}
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
            <DialogTitle>{translate('socialMedia')}</DialogTitle>
            <DialogDescription>
              {translate('socialMediaDescription')}
            </DialogDescription>
          </DialogHeader>

          {hasVisibleConnections ? (
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
                      {translate('disconnectNamed', {
                        account: getConnectionLabel(connection),
                      })}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  {translate('addAnotherDescription')}
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
                {translate('connectSocialAccountsDescription')}
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
