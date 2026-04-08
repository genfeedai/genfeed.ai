'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, ComponentSize, ModalEnum } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import type { QuotaStatus } from '@genfeedai/interfaces/organization/quota-status.interface';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { useCredentialModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import {
  IntegrationsService,
  type IOrgIntegration,
} from '@services/organization/integrations.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import BadgeQuota from '@ui/display/badge-quota/BadgeQuota';
import AppTable from '@ui/display/table/Table';
import { LazyModalBrandInstagram } from '@ui/lazy/modal/LazyModal';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaDiscord,
  FaInstagram,
  FaSlack,
  FaStar,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import {
  HiCheck,
  HiEye,
  HiPaperAirplane,
  HiPencil,
  HiTrash,
} from 'react-icons/hi2';

export default function SettingsCredentialsPage() {
  const { brandId, organizationId, selectedBrand } = useBrand();
  const { openCredentialModal } = useCredentialModal();
  const notifications = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const autoConnectTriggeredRef = useRef(false);

  const [instagramCredential, setInstagramCredential] =
    useState<ICredential | null>(null);
  const [telegramMode, setTelegramMode] = useState<'org-owned' | 'shared'>(
    'shared',
  );
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramAllowedUsers, setTelegramAllowedUsers] = useState('');
  const [telegramDefaultWorkflow, setTelegramDefaultWorkflow] = useState('');
  const [telegramWebhookMode, setTelegramWebhookMode] = useState(false);
  const [telegramIntegration, setTelegramIntegration] =
    useState<IOrgIntegration | null>(null);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [isTelegramSaving, setIsTelegramSaving] = useState(false);

  // Slack state
  const [slackBotToken, setSlackBotToken] = useState('');
  const [slackAppToken, setSlackAppToken] = useState('');
  const [slackAllowedUsers, setSlackAllowedUsers] = useState('');
  const [slackDefaultWorkflow, setSlackDefaultWorkflow] = useState('');
  const [slackIntegration, setSlackIntegration] =
    useState<IOrgIntegration | null>(null);
  const [isSlackLoading, setIsSlackLoading] = useState(false);
  const [isSlackSaving, setIsSlackSaving] = useState(false);

  // Discord state
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [discordAllowedUsers, setDiscordAllowedUsers] = useState('');
  const [discordDefaultWorkflow, setDiscordDefaultWorkflow] = useState('');
  const [discordIntegration, setDiscordIntegration] =
    useState<IOrgIntegration | null>(null);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isDiscordSaving, setIsDiscordSaving] = useState(false);

  const handleConnectInstagram = () => {
    setInstagramCredential(null);
    openModal(ModalEnum.BRAND_INSTAGRAM);
  };

  const { getToken } = useAuth();

  const handleConnectPlatform = useCallback(
    async (platform: string) => {
      if (!selectedBrand) {
        return;
      }

      try {
        const returnTo = searchParams.get('returnTo');
        if (returnTo) {
          localStorage.setItem('genfeed:oauth:returnTo', returnTo);
        }
        const token = (await resolveClerkToken(getToken)) ?? '';
        const service = new ServicesService(platform, token);
        const credentialOAuth = await service.postConnect({
          brand: selectedBrand.id,
        });

        window.open(credentialOAuth.url, '_self');
      } catch (error) {
        logger.error(`Failed to initiate ${platform} OAuth:`, error);
        notifications.error(`Connect ${platform}`);
      }
    },
    [getToken, notifications, searchParams, selectedBrand],
  );

  useEffect(() => {
    const connectPlatform = searchParams.get('connect');
    if (!connectPlatform || !selectedBrand || autoConnectTriggeredRef.current) {
      return;
    }
    autoConnectTriggeredRef.current = true;
    void handleConnectPlatform(connectPlatform);
  }, [searchParams, selectedBrand, handleConnectPlatform]);

  const [quotaStatuses, setQuotaStatuses] = useState<
    Record<string, QuotaStatus>
  >({});

  const getBrandsService = useAuthedService(
    useCallback((token: string) => BrandsService.getInstance(token), []),
  );

  const getCredentialsService = useAuthedService(
    useCallback((token: string) => CredentialsService.getInstance(token), []),
  );
  const getIntegrationsService = useAuthedService(
    useCallback((token: string) => IntegrationsService.getInstance(token), []),
  );

  const {
    data: credentials,
    isLoading,
    refresh,
  } = useResource<ICredential[]>(
    async () => {
      if (!brandId) {
        return [];
      }
      const service = await getBrandsService();
      return service.findBrandCredentials(brandId);
    },
    {
      defaultValue: [],
      dependencies: [brandId],
      onError: (error: Error) => {
        logger.error(`GET /brands/${brandId}/credentials failed`, error);
      },
    },
  );

  useEffect(() => {
    if (!credentials?.length || !organizationId) {
      return;
    }

    const controller = new AbortController();

    const fetchQuotaStatuses = async () => {
      const service = await getCredentialsService();
      const statuses: Record<string, QuotaStatus> = {};

      await Promise.all(
        credentials.map(async (credential) => {
          if (controller.signal.aborted) {
            return;
          }
          try {
            const status = await service.getQuotaStatus(
              credential.id,
              organizationId,
            );
            statuses[credential.id] = status;
          } catch (error) {
            logger.error(`Failed to fetch quota for ${credential.id}`, error);
          }
        }),
      );

      if (!controller.signal.aborted) {
        setQuotaStatuses(statuses);
      }
    };

    fetchQuotaStatuses();

    return () => controller.abort();
  }, [credentials, organizationId, getCredentialsService]);

  const hydrateTelegramState = useCallback((integration: IOrgIntegration) => {
    setTelegramIntegration(integration);
    setTelegramDefaultWorkflow(integration.config?.defaultWorkflow || '');
    setTelegramAllowedUsers(
      integration.config?.allowedUserIds?.join(', ') || '',
    );
    setTelegramWebhookMode(Boolean(integration.config?.webhookMode));
    setTelegramMode('org-owned');
  }, []);

  const hydrateSlackState = useCallback((integration: IOrgIntegration) => {
    setSlackIntegration(integration);
    setSlackDefaultWorkflow(integration.config?.defaultWorkflow || '');
    setSlackAllowedUsers(integration.config?.allowedUserIds?.join(', ') || '');
  }, []);

  const hydrateDiscordState = useCallback((integration: IOrgIntegration) => {
    setDiscordIntegration(integration);
    setDiscordDefaultWorkflow(integration.config?.defaultWorkflow || '');
    setDiscordAllowedUsers(
      integration.config?.allowedUserIds?.join(', ') || '',
    );
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setTelegramIntegration(null);
      setSlackIntegration(null);
      setDiscordIntegration(null);
      return;
    }

    let disposed = false;

    const fetchIntegrations = async () => {
      setIsTelegramLoading(true);
      setIsSlackLoading(true);
      setIsDiscordLoading(true);
      try {
        const service = await getIntegrationsService();
        const integrations = await service.findAll(organizationId);
        if (disposed) {
          return;
        }

        const telegram = integrations.find((i) => i.platform === 'telegram');
        const slack = integrations.find((i) => i.platform === 'slack');
        const discord = integrations.find((i) => i.platform === 'discord');

        if (telegram) {
          hydrateTelegramState(telegram);
        } else {
          setTelegramIntegration(null);
        }

        if (slack) {
          hydrateSlackState(slack);
        } else {
          setSlackIntegration(null);
        }

        if (discord) {
          hydrateDiscordState(discord);
        } else {
          setDiscordIntegration(null);
        }
      } catch (error) {
        logger.error(
          `GET /organizations/${organizationId}/integrations failed`,
          error as Error,
        );
      } finally {
        if (!disposed) {
          setIsTelegramLoading(false);
          setIsSlackLoading(false);
          setIsDiscordLoading(false);
        }
      }
    };

    fetchIntegrations();

    return () => {
      disposed = true;
    };
  }, [
    organizationId,
    getIntegrationsService,
    hydrateTelegramState,
    hydrateSlackState,
    hydrateDiscordState,
  ]);

  const parseAllowedUserIds = useCallback((): string[] => {
    return telegramAllowedUsers
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }, [telegramAllowedUsers]);

  const handleSaveTelegramIntegration = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Missing organization context');
      return;
    }

    if (!telegramToken.trim() && !telegramIntegration?.id) {
      notifications.error('Telegram bot token is required');
      return;
    }

    setIsTelegramSaving(true);

    try {
      const service = await getIntegrationsService();
      const config = {
        allowedUserIds: parseAllowedUserIds(),
        defaultWorkflow: telegramDefaultWorkflow.trim() || undefined,
        webhookMode: telegramWebhookMode,
      };

      const integrationId = telegramIntegration?.id || telegramIntegration?._id;
      const saved = integrationId
        ? await service.update(organizationId, integrationId, {
            ...(telegramToken.trim() ? { botToken: telegramToken.trim() } : {}),
            config,
          })
        : await service.create(organizationId, {
            botToken: telegramToken.trim(),
            config,
            platform: 'telegram',
          });

      hydrateTelegramState(saved);
      setTelegramToken('');
      notifications.success(
        integrationId
          ? 'Telegram integration updated'
          : 'Telegram integration connected',
      );
    } catch (error) {
      logger.error(
        `POST/PATCH /organizations/${organizationId}/integrations failed`,
        error,
      );
      notifications.error('Failed to save Telegram integration');
    } finally {
      setIsTelegramSaving(false);
    }
  }, [
    getIntegrationsService,
    hydrateTelegramState,
    notifications,
    organizationId,
    parseAllowedUserIds,
    telegramDefaultWorkflow,
    telegramIntegration?._id,
    telegramIntegration?.id,
    telegramToken,
    telegramWebhookMode,
  ]);

  const handleDisconnectTelegramIntegration = useCallback(async () => {
    const integrationId = telegramIntegration?.id || telegramIntegration?._id;
    if (!organizationId || !integrationId) {
      notifications.error('No Telegram integration found');
      return;
    }

    setIsTelegramSaving(true);
    try {
      const service = await getIntegrationsService();
      await service.remove(organizationId, integrationId);
      setTelegramIntegration(null);
      setTelegramToken('');
      setTelegramAllowedUsers('');
      setTelegramDefaultWorkflow('');
      setTelegramWebhookMode(false);
      notifications.success('Telegram integration disconnected');
    } catch (error) {
      logger.error(
        `DELETE /organizations/${organizationId}/integrations/${integrationId} failed`,
        error,
      );
      notifications.error('Failed to disconnect Telegram integration');
    } finally {
      setIsTelegramSaving(false);
    }
  }, [
    getIntegrationsService,
    notifications,
    organizationId,
    telegramIntegration?._id,
    telegramIntegration?.id,
  ]);

  // --- Slack handlers ---
  const parseSlackAllowedUserIds = useCallback((): string[] => {
    return slackAllowedUsers
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }, [slackAllowedUsers]);

  const handleSaveSlackIntegration = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Missing organization context');
      return;
    }
    if (!slackBotToken.trim() && !slackIntegration?.id) {
      notifications.error('Slack bot token is required');
      return;
    }
    if (!slackAppToken.trim() && !slackIntegration?.id) {
      notifications.error('Slack app token is required for socket mode');
      return;
    }

    setIsSlackSaving(true);
    try {
      const service = await getIntegrationsService();
      const config = {
        allowedUserIds: parseSlackAllowedUserIds(),
        appToken: slackAppToken.trim() || undefined,
        defaultWorkflow: slackDefaultWorkflow.trim() || undefined,
      };

      const integrationId = slackIntegration?.id || slackIntegration?._id;
      const saved = integrationId
        ? await service.update(organizationId, integrationId, {
            ...(slackBotToken.trim() ? { botToken: slackBotToken.trim() } : {}),
            config,
          })
        : await service.create(organizationId, {
            botToken: slackBotToken.trim(),
            config,
            platform: 'slack',
          });

      hydrateSlackState(saved);
      setSlackBotToken('');
      setSlackAppToken('');
      notifications.success(
        integrationId
          ? 'Slack integration updated'
          : 'Slack integration connected',
      );
    } catch (error) {
      logger.error(
        `POST/PATCH /organizations/${organizationId}/integrations (slack) failed`,
        error,
      );
      notifications.error('Failed to save Slack integration');
    } finally {
      setIsSlackSaving(false);
    }
  }, [
    getIntegrationsService,
    hydrateSlackState,
    notifications,
    organizationId,
    parseSlackAllowedUserIds,
    slackAppToken,
    slackBotToken,
    slackDefaultWorkflow,
    slackIntegration?._id,
    slackIntegration?.id,
  ]);

  const handleDisconnectSlackIntegration = useCallback(async () => {
    const integrationId = slackIntegration?.id || slackIntegration?._id;
    if (!organizationId || !integrationId) {
      notifications.error('No Slack integration found');
      return;
    }
    setIsSlackSaving(true);
    try {
      const service = await getIntegrationsService();
      await service.remove(organizationId, integrationId);
      setSlackIntegration(null);
      setSlackBotToken('');
      setSlackAppToken('');
      setSlackAllowedUsers('');
      setSlackDefaultWorkflow('');
      notifications.success('Slack integration disconnected');
    } catch (error) {
      logger.error(
        `DELETE /organizations/${organizationId}/integrations/${integrationId} (slack) failed`,
        error,
      );
      notifications.error('Failed to disconnect Slack integration');
    } finally {
      setIsSlackSaving(false);
    }
  }, [
    getIntegrationsService,
    notifications,
    organizationId,
    slackIntegration?._id,
    slackIntegration?.id,
  ]);

  // --- Discord handlers ---
  const parseDiscordAllowedUserIds = useCallback((): string[] => {
    return discordAllowedUsers
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }, [discordAllowedUsers]);

  const handleSaveDiscordIntegration = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Missing organization context');
      return;
    }
    if (!discordBotToken.trim() && !discordIntegration?.id) {
      notifications.error('Discord bot token is required');
      return;
    }

    setIsDiscordSaving(true);
    try {
      const service = await getIntegrationsService();
      const config = {
        allowedUserIds: parseDiscordAllowedUserIds(),
        defaultWorkflow: discordDefaultWorkflow.trim() || undefined,
      };

      const integrationId = discordIntegration?.id || discordIntegration?._id;
      const saved = integrationId
        ? await service.update(organizationId, integrationId, {
            ...(discordBotToken.trim()
              ? { botToken: discordBotToken.trim() }
              : {}),
            config,
          })
        : await service.create(organizationId, {
            botToken: discordBotToken.trim(),
            config,
            platform: 'discord',
          });

      hydrateDiscordState(saved);
      setDiscordBotToken('');
      notifications.success(
        integrationId
          ? 'Discord integration updated'
          : 'Discord integration connected',
      );
    } catch (error) {
      logger.error(
        `POST/PATCH /organizations/${organizationId}/integrations (discord) failed`,
        error,
      );
      notifications.error('Failed to save Discord integration');
    } finally {
      setIsDiscordSaving(false);
    }
  }, [
    discordBotToken,
    discordDefaultWorkflow,
    discordIntegration?._id,
    discordIntegration?.id,
    getIntegrationsService,
    hydrateDiscordState,
    notifications,
    organizationId,
    parseDiscordAllowedUserIds,
  ]);

  const handleDisconnectDiscordIntegration = useCallback(async () => {
    const integrationId = discordIntegration?.id || discordIntegration?._id;
    if (!organizationId || !integrationId) {
      notifications.error('No Discord integration found');
      return;
    }
    setIsDiscordSaving(true);
    try {
      const service = await getIntegrationsService();
      await service.remove(organizationId, integrationId);
      setDiscordIntegration(null);
      setDiscordBotToken('');
      setDiscordAllowedUsers('');
      setDiscordDefaultWorkflow('');
      notifications.success('Discord integration disconnected');
    } catch (error) {
      logger.error(
        `DELETE /organizations/${organizationId}/integrations/${integrationId} (discord) failed`,
        error,
      );
      notifications.error('Failed to disconnect Discord integration');
    } finally {
      setIsDiscordSaving(false);
    }
  }, [
    discordIntegration?._id,
    discordIntegration?.id,
    getIntegrationsService,
    notifications,
    organizationId,
  ]);

  const handleCopySharedBotGuide = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        '/connect <your_genfeed_api_key>\n/generate your prompt\n/post\n/analytics',
      );
      notifications.success('Shared bot command guide copied');
    } catch (error) {
      logger.error('Failed to copy Telegram setup guide', error as Error);
      notifications.error('Failed to copy command guide');
    }
  }, [notifications]);

  const columns: TableColumn<ICredential>[] = [
    { header: 'Platform', key: 'platform' },
    {
      header: 'Handle',
      key: 'externalHandle',
      render: (c: ICredential) => c.externalHandle || 'Not connected',
    },
    {
      header: 'Default Title',
      key: 'label',
      render: (c: ICredential) => c.label || '-',
    },
    {
      header: 'Daily Quota',
      key: 'quota',
      render: (c: ICredential) => {
        const status = quotaStatuses[c.id];
        if (!status) {
          return <span className="text-xs text-foreground/50">Loading...</span>;
        }
        return (
          <BadgeQuota
            currentCount={status.currentCount}
            dailyLimit={status.dailyLimit}
            platform={status.platform}
            size={ComponentSize.SM}
            showLabel={false}
          />
        );
      },
    },
    {
      header: 'Tags',
      key: 'tags',
      render: (c: ICredential) => {
        if (!c.tags?.length) {
          return '-';
        }
        return (
          <div className="flex flex-wrap gap-2">
            {c.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
              >
                {typeof tag === 'string' ? tag : tag.label}
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  const actions: TableAction<ICredential>[] = [
    {
      icon: <FaInstagram className="h-4 w-4" />,
      isVisible: (c: ICredential) => c.platform === 'instagram',
      onClick: (c: ICredential) => {
        setInstagramCredential(c);
        openModal(ModalEnum.BRAND_INSTAGRAM);
      },
      tooltip: 'Choose Account',
    },
    {
      icon: <HiPencil />,
      onClick: (c: ICredential) => {
        openCredentialModal(c, refresh);
      },
      tooltip: 'Edit',
    },
    {
      icon: <HiEye />,
      onClick: (c: ICredential) => {
        window.open(c.externalUrl, '_blank');
      },
      tooltip: 'View',
    },
  ];

  return (
    <>
      <div id="telegram-integration">
        <Card className="mb-6 p-6">
          <h2 className="text-lg font-semibold mb-4">
            Telegram Bot Integration
          </h2>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              variant={
                telegramMode === 'shared'
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => setTelegramMode('shared')}
            >
              Shared @GenFeedCloudBot
            </Button>
            <Button
              variant={
                telegramMode === 'org-owned'
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => setTelegramMode('org-owned')}
            >
              Org-owned Telegram bot
            </Button>
          </div>

          {telegramMode === 'shared' ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Fastest path: use the shared <strong>@GenFeedCloudBot</strong>{' '}
                and connect your org with API key inside Telegram.
              </p>
              <p>
                In Telegram, run: <code>/connect &lt;api_key&gt;</code>
              </p>
              <div className="flex gap-2">
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={handleCopySharedBotGuide}
                >
                  <HiPaperAirplane className="mr-2 h-4 w-4" />
                  Copy command guide
                </Button>
                <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
                  <Link href="/settings/organization/api-keys">
                    Manage API keys
                  </Link>
                </PrimitiveButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your organization Telegram bot token for branded bot
                ownership and isolated org routing.
              </p>

              {telegramIntegration && (
                <div className="rounded border border-foreground/10 p-3 text-sm">
                  <p className="font-medium flex items-center gap-2">
                    <HiCheck className="h-4 w-4 text-green-600" />
                    Active integration ({telegramIntegration.status || 'active'}
                    )
                  </p>
                  <p className="text-muted-foreground mt-1">
                    ID: {telegramIntegration.id || telegramIntegration._id}
                  </p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="form-control">
                  <span className="label-text text-sm font-medium">
                    Bot token
                  </span>
                  <Input
                    className="input input-bordered w-full"
                    placeholder={
                      telegramIntegration
                        ? 'Leave empty to keep existing token'
                        : 'Paste Telegram bot token'
                    }
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text text-sm font-medium">
                    Default workflow (optional)
                  </span>
                  <Input
                    className="input input-bordered w-full"
                    placeholder="workflow-id"
                    value={telegramDefaultWorkflow}
                    onChange={(e) => setTelegramDefaultWorkflow(e.target.value)}
                  />
                </label>
              </div>

              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Allowed Telegram user IDs (comma-separated)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder="123456789, 987654321"
                  value={telegramAllowedUsers}
                  onChange={(e) => setTelegramAllowedUsers(e.target.value)}
                />
              </label>

              <label className="label cursor-pointer justify-start gap-3">
                <Switch
                  checked={telegramWebhookMode}
                  onCheckedChange={setTelegramWebhookMode}
                  aria-label="Enable Telegram webhook mode"
                />
                <span className="label-text">Webhook mode</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={ButtonVariant.DEFAULT}
                  onClick={() => {
                    handleSaveTelegramIntegration();
                  }}
                  isDisabled={isTelegramSaving || isTelegramLoading}
                >
                  {telegramIntegration
                    ? 'Update Telegram bot'
                    : 'Connect Telegram bot'}
                </Button>

                {telegramIntegration && (
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => {
                      handleDisconnectTelegramIntegration();
                    }}
                    isDisabled={isTelegramSaving}
                  >
                    <HiTrash className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div id="slack-integration">
        <Card className="mb-6 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FaSlack className="h-5 w-5" />
            Slack Bot Integration
          </h2>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Slack bot token and app token for socket mode
              integration.
            </p>

            {slackIntegration && (
              <div className="rounded border border-foreground/10 p-3 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <HiCheck className="h-4 w-4 text-green-600" />
                  Active integration ({slackIntegration.status || 'active'})
                </p>
                <p className="text-muted-foreground mt-1">
                  ID: {slackIntegration.id || slackIntegration._id}
                </p>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Bot token (xoxb-...)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder={
                    slackIntegration
                      ? 'Leave empty to keep existing token'
                      : 'Paste Slack bot token'
                  }
                  type="password"
                  value={slackBotToken}
                  onChange={(e) => setSlackBotToken(e.target.value)}
                />
              </label>

              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  App token for socket mode (xapp-...)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder={
                    slackIntegration
                      ? 'Leave empty to keep existing token'
                      : 'Paste Slack app token'
                  }
                  type="password"
                  value={slackAppToken}
                  onChange={(e) => setSlackAppToken(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Default workflow (optional)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder="workflow-id"
                  value={slackDefaultWorkflow}
                  onChange={(e) => setSlackDefaultWorkflow(e.target.value)}
                />
              </label>

              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Allowed Slack user IDs (comma-separated)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder="U123456, U789012"
                  value={slackAllowedUsers}
                  onChange={(e) => setSlackAllowedUsers(e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={() => {
                  handleSaveSlackIntegration();
                }}
                isDisabled={isSlackSaving || isSlackLoading}
              >
                {slackIntegration ? 'Update Slack bot' : 'Connect Slack bot'}
              </Button>

              {slackIntegration && (
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    handleDisconnectSlackIntegration();
                  }}
                  isDisabled={isSlackSaving}
                >
                  <HiTrash className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div id="discord-integration">
        <Card className="mb-6 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FaDiscord className="h-5 w-5" />
            Discord Bot Integration
          </h2>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Discord bot token for slash command integration.
            </p>

            {discordIntegration && (
              <div className="rounded border border-foreground/10 p-3 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <HiCheck className="h-4 w-4 text-green-600" />
                  Active integration ({discordIntegration.status || 'active'})
                </p>
                <p className="text-muted-foreground mt-1">
                  ID: {discordIntegration.id || discordIntegration._id}
                </p>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Bot token
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder={
                    discordIntegration
                      ? 'Leave empty to keep existing token'
                      : 'Paste Discord bot token'
                  }
                  type="password"
                  value={discordBotToken}
                  onChange={(e) => setDiscordBotToken(e.target.value)}
                />
              </label>

              <label className="form-control">
                <span className="label-text text-sm font-medium">
                  Default workflow (optional)
                </span>
                <Input
                  className="input input-bordered w-full"
                  placeholder="workflow-id"
                  value={discordDefaultWorkflow}
                  onChange={(e) => setDiscordDefaultWorkflow(e.target.value)}
                />
              </label>
            </div>

            <label className="form-control">
              <span className="label-text text-sm font-medium">
                Allowed Discord user IDs (comma-separated)
              </span>
              <Input
                className="input input-bordered w-full"
                placeholder="123456789, 987654321"
                value={discordAllowedUsers}
                onChange={(e) => setDiscordAllowedUsers(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={() => {
                  handleSaveDiscordIntegration();
                }}
                isDisabled={isDiscordSaving || isDiscordLoading}
              >
                {discordIntegration
                  ? 'Update Discord bot'
                  : 'Connect Discord bot'}
              </Button>

              {discordIntegration && (
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    handleDisconnectDiscordIntegration();
                  }}
                  isDisabled={isDiscordSaving}
                >
                  <HiTrash className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-4 flex justify-end gap-2">
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => handleConnectPlatform('twitter')}
        >
          <FaXTwitter className="mr-2 h-4 w-4" />
          Connect Twitter
        </Button>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => handleConnectPlatform('tiktok')}
        >
          <FaTiktok className="mr-2 h-4 w-4" />
          Connect TikTok
        </Button>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => handleConnectPlatform('youtube')}
        >
          <FaYoutube className="mr-2 h-4 w-4" />
          Connect YouTube
        </Button>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={handleConnectInstagram}
        >
          <FaInstagram className="mr-2 h-4 w-4" />
          Connect Instagram
        </Button>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => handleConnectPlatform('fanvue')}
        >
          <FaStar className="mr-2 h-4 w-4" />
          Connect Fanvue
        </Button>
      </div>

      <AppTable<ICredential>
        items={credentials || []}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(c) => c.id}
        emptyLabel="No credentials connected"
      />

      <LazyModalBrandInstagram
        brand={selectedBrand ?? null}
        credential={instagramCredential}
        onConfirm={() => {
          setInstagramCredential(null);
          refresh();
        }}
      />
    </>
  );
}
