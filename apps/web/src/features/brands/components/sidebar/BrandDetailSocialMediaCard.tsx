'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  type CredentialPlatform,
} from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import {
  groupOAuthConnectPlatforms,
  type ResolvedOAuthConnectPlatform,
  resolveOAuthServicePath,
} from '@genfeedai/helpers/oauth/oauth-connect-platforms';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOAuthConnectPlatforms } from '@hooks/auth/use-oauth-connect-platforms/use-oauth-connect-platforms';
import type { BrandDetailSocialMediaCardProps } from '@props/pages/brand-detail.props';
import type { ApiKeyConnectTarget } from '@props/pages/brand-integrations.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AccountHistoryImportOffers from '@/features/brands/components/integrations/AccountHistoryImportOffers';
import AccountSettingsDialog from '@/features/brands/components/integrations/AccountSettingsDialog';
import AccountsTable from '@/features/brands/components/integrations/AccountsTable';
import ApiKeyConnectDialog from '@/features/brands/components/integrations/ApiKeyConnectDialog';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
  hasHistoryImport,
  hasWarmupBlueprint,
  STATE_MESSAGE_KEYS,
} from '@/features/brands/components/integrations/account-connection-status.util';
import { getHealthBadgeVariant } from '@/features/brands/components/integrations/account-health-badge-variant';
import ConnectAccountModal from '@/features/brands/components/integrations/ConnectAccountModal';
import FacebookLiveDialog from '@/features/brands/components/integrations/FacebookLiveDialog';
import BrandDetailConnectedAccount from '@/features/brands/components/sidebar/BrandDetailConnectedAccount';
import SocialWarmupProgram from '@/features/brands/components/sidebar/social-warmup/SocialWarmupProgram';
import {
  rememberOAuthConnectContext,
  rememberOAuthReturnTo,
} from '@/hooks/auth/use-platform-oauth-connect/oauth-connect-context';

const _LEADING_AT_SIGN_PATTERN = /^@/;
// The add-bot link lives 15 minutes, so the page looks for the group that long.
const ADD_BOT_POLL_INTERVAL_MS = 10_000;
const ADD_BOT_POLL_MAX_CHECKS = 90;

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
  'connectMethod' | 'isConnectAvailable' | 'label' | 'platform' | 'servicePath'
>;

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  historyImportReturnTo,
  isConnectAccountModalOpen: controlledIsConnectAccountModalOpen,
  onConnectAccountModalOpenChange,
  onRefresh,
  variant = 'compact',
}: BrandDetailSocialMediaCardProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const isPageVariant = variant === 'page';
  const { getToken } = useAuthIdentity();
  const { refreshBrands } = useBrand();
  const oauthConnectPlatforms = useOAuthConnectPlatforms();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [
    uncontrolledIsConnectAccountModalOpen,
    setUncontrolledIsConnectAccountModalOpen,
  ] = useState(false);
  const isConnectAccountModalOpen =
    controlledIsConnectAccountModalOpen ??
    uncontrolledIsConnectAccountModalOpen;
  const setIsConnectAccountModalOpen =
    onConnectAccountModalOpenChange ?? setUncontrolledIsConnectAccountModalOpen;
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
  const [selectedCredentialId, setSelectedCredentialId] = useState<
    string | null
  >(null);
  const [disconnectTarget, setDisconnectTarget] =
    useState<SocialConnection | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<SocialConnection | null>(
    null,
  );
  // Ghost, dev.to and Beehiiv connect with an API key, so they open a form
  // instead of redirecting to a provider. The target outlives the close so
  // the form keeps its fields while it animates out.
  const [apiKeyConnectTarget, setApiKeyConnectTarget] =
    useState<ApiKeyConnectTarget | null>(null);
  const [isApiKeyConnectOpen, setIsApiKeyConnectOpen] = useState(false);
  // Kept after close so the dialog does not change while it animates out.
  const [liveTarget, setLiveTarget] = useState<SocialConnection | null>(null);
  const [isLiveOpen, setIsLiveOpen] = useState(false);

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
  const platformConnections = useMemo(() => {
    const byPlatform: Partial<Record<CredentialPlatform, SocialConnection[]>> =
      {};
    for (const connection of connectedConnections) {
      if (getAccountConnectionStatus(connection) !== 'connected') {
        continue;
      }
      byPlatform[connection.platform] = [
        ...(byPlatform[connection.platform] ?? []),
        connection,
      ];
    }
    return byPlatform;
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

  // use-effect-audit: ignore abortable work
  useEffect(() => {
    const controller = new AbortController();
    void loadAccountHealth(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadAccountHealth]);

  // Telegram connects when the bot is added to a group in Telegram, so this
  // page re-reads the connections for a couple of minutes after the link opens.
  const addBotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAddBotPolling = useCallback(() => {
    if (addBotPollRef.current) {
      clearInterval(addBotPollRef.current);
      addBotPollRef.current = null;
    }
  }, []);
  // use-effect-audit: ignore releases timers, requests or subscriptions on unmount
  useEffect(() => stopAddBotPolling, [stopAddBotPolling]);

  const startAddBotPolling = () => {
    stopAddBotPolling();
    let remainingChecks = ADD_BOT_POLL_MAX_CHECKS;
    addBotPollRef.current = setInterval(() => {
      remainingChecks -= 1;
      void Promise.all([onRefresh?.(), refreshBrands()]);
      if (remainingChecks <= 0) {
        stopAddBotPolling();
      }
    }, ADD_BOT_POLL_INTERVAL_MS);
  };

  const handleConnectPlatform = async (
    item: ConnectablePlatform,
    credentialId?: string,
  ) => {
    if (!item.isConnectAvailable) {
      return;
    }

    if (item.connectMethod === 'api_key') {
      setIsConnectAccountModalOpen(false);
      setIsDialogOpen(false);
      setApiKeyConnectTarget({
        platform: item.platform,
        reconnectExternalId: credentialId
          ? connections.find(
              (connection) => connection.credentialId === credentialId,
            )?.externalId
          : undefined,
        servicePath: resolveOAuthServicePath(item.platform, item.servicePath),
      });
      setIsApiKeyConnectOpen(true);
      return;
    }

    if (item.connectMethod === 'add_bot_link') {
      // Opened before the first await so a popup blocker still sees the click.
      const tab = window.open('about:blank', '_blank');
      try {
        setConnectingPlatform(item.platform);
        const token = (await resolveAuthToken(getToken)) ?? '';
        const service = new ServicesService(
          resolveOAuthServicePath(item.platform, item.servicePath),
          token,
        );
        const { url } = await service.postConnect({ brandId });
        setIsConnectAccountModalOpen(false);
        setIsDialogOpen(false);
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.open(url, '_self');
        }
        NotificationsService.getInstance().info(translate('telegramAddBot'));
        startAddBotPolling();
      } catch (error) {
        tab?.close();
        logger.error(`Failed to start ${item.platform} connect:`, error);
        NotificationsService.getInstance().error(
          translate('connectPlatformError', { platform: item.label }),
        );
      } finally {
        setConnectingPlatform(null);
      }
      return;
    }

    const platform = item.platform;
    const shouldOfferHistoryImport =
      !credentialId && hasHistoryImport(platform);
    try {
      setConnectingPlatform(platform);
      if (credentialId) {
        setReconnectingCredentialId(credentialId);
      }
      const token = (await resolveAuthToken(getToken)) ?? '';
      // Provider redirects drop query params, so /oauth/[platform] reads
      // return_to from sessionStorage after verify.
      rememberOAuthReturnTo(
        (shouldOfferHistoryImport && historyImportReturnTo) ||
          `${window.location.pathname}${window.location.search}`,
      );
      const service = new ServicesService(
        resolveOAuthServicePath(platform, item.servicePath),
        token,
      );
      // A reconnect carries the existing credentialId so the server re-links
      // the same row instead of minting a duplicate connected account.
      const credentialOAuth = await service.postConnect({
        brandId,
        ...(credentialId ? { credentialId } : {}),
        ...(shouldOfferHistoryImport
          ? { isHistoryImportRequested: false }
          : {}),
      });
      rememberOAuthConnectContext({
        brandId,
        credentialId: credentialOAuth.id || credentialId,
        shouldOfferHistoryImport,
      });
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(
        translate('connectPlatformError', { platform: item.label }),
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
      // disappears once the brand is reloaded. Brand context (agent sidebar,
      // publishing gates) reads credentials from the bootstrap, so drop its
      // client snapshot too.
      await Promise.all([onRefresh?.(), refreshBrands()]);
    } catch (error) {
      logger.error('Failed to disconnect account', error);
      NotificationsService.getInstance().error(
        translate('disconnectAccountError'),
      );
    } finally {
      setIsDisconnecting(false);
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
          <h3 className="text-xs font-semibold uppercase tracking-label text-muted-foreground">
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
            onReconnect={(platform) => {
              const item = oauthConnectPlatforms.find(
                (entry) => entry.platform === platform,
              );
              if (item) {
                void handleConnectPlatform(
                  item,
                  selectedConnection.credentialId,
                );
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
                  <Badge
                    className="shrink-0"
                    variant={getHealthBadgeVariant(summary)}
                  >
                    {translate(STATE_MESSAGE_KEYS[summary.state])}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {formatHealthDetail(summary)}
                </p>
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
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {disconnectTarget
              ? translate('disconnectAccountDescription', {
                  account: getConnectionLabel(disconnectTarget),
                  platform: disconnectTarget.platform,
                })
              : ''}
          </DialogDescription>
        </DialogBody>

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const apiKeyConnectDialog = (
    <ApiKeyConnectDialog
      brandId={brandId}
      onConnected={async () => {
        await Promise.all([onRefresh?.(), refreshBrands()]);
      }}
      onOpenChange={setIsApiKeyConnectOpen}
      open={isApiKeyConnectOpen}
      target={apiKeyConnectTarget}
    />
  );

  const importOffers = (
    <Suspense fallback={null}>
      <AccountHistoryImportOffers brandId={brandId} connections={connections} />
    </Suspense>
  );

  if (isPageVariant) {
    return (
      <>
        {importOffers}
        <AccountsTable
          accountHealth={healthRows}
          connections={connectedConnections}
          onConnectAccount={() => setIsConnectAccountModalOpen(true)}
          onDisconnect={setDisconnectTarget}
          onGoLive={(connection) => {
            setLiveTarget(connection);
            setIsLiveOpen(true);
          }}
          onOpenSettings={setSettingsTarget}
          onReconnect={handleReconnect}
          reconnectingCredentialId={reconnectingCredentialId}
          unavailablePlatforms={unavailablePlatforms}
        />

        <FacebookLiveDialog
          connection={liveTarget}
          onOpenChange={setIsLiveOpen}
          open={isLiveOpen}
        />

        <ConnectAccountModal
          connectingPlatform={connectingPlatform}
          onConnect={(item) => void handleConnectPlatform(item)}
          onOpenChange={setIsConnectAccountModalOpen}
          open={isConnectAccountModalOpen}
          platformConnections={platformConnections}
          platformGroups={allPlatformGroups}
        />

        <AccountSettingsDialog
          brandId={brandId}
          connection={settingsTarget}
          health={healthRows.find(
            (summary) => summary.credentialId === settingsTarget?.credentialId,
          )}
          onOpenChange={(open) => {
            if (!open) {
              setSettingsTarget(null);
            }
          }}
          onReconnect={handleReconnect}
        />

        {disconnectDialog}
        {apiKeyConnectDialog}
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
            className="h-8 shrink-0 px-2.5"
            onClick={() => setIsDialogOpen(true)}
          >
            {hasConnectedAccounts ? translate('manage') : translate('connect')}
          </Button>
        }
      >
        {importOffers}
        {hasConnectedAccounts ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectedConnections.map((connection) => (
              <BrandDetailConnectedAccount
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
          <Alert size="sm" variant="note">
            {translate('empty')}
          </Alert>
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

          <DialogBody className="flex flex-col gap-4">
            {hasVisibleConnections ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {connectedConnections.map((connection) => (
                    <div className="space-y-1" key={connection.credentialId}>
                      <BrandDetailConnectedAccount connection={connection} />
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        className="h-7 px-2 text-2xs"
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
                      <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">
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
                    <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.platforms.map(renderConnectButton)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {disconnectDialog}
      {apiKeyConnectDialog}
    </>
  );
}
