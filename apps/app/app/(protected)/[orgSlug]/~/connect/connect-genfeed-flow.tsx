'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getDeployment,
  isSelfHostedDeployment,
} from '@genfeedai/config/deployment';
import { ButtonVariant } from '@genfeedai/contracts';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import type {
  ConnectGenfeedAuthMethod,
  ConnectGenfeedClient,
  ConnectGenfeedVerificationResult,
} from '@genfeedai/contracts/interfaces';
import { buildConnectGenfeedInstructions } from '@genfeedai/helpers/integrations/connect-genfeed.helper';
import { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { hasApiAccess } from '@genfeedai/pricing';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ApiKeysService } from '@services/management/api-keys.service';
import Card from '@ui/card/Card';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  ArrowRight,
  CircleCheck,
  Clipboard,
  Key,
  LinkIcon,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ANALYTICS_EVENTS,
  type ConnectGenfeedStep,
  captureAnalyticsEvent,
} from '@/lib/analytics';

const CLIENTS = [
  {
    description: 'Register Genfeed, then authorize in your browser.',
    label: 'Claude Code',
    value: 'claude-code',
  },
  {
    description: 'Browser authorization with CLI setup or config.toml.',
    label: 'Codex',
    value: 'codex',
  },
  {
    description: 'Portable Streamable HTTP configuration.',
    label: 'Generic MCP',
    value: 'generic',
  },
] as const;

const FIRST_ACTION_PROMPT =
  'List my Genfeed brands, then create a draft social post for review. Do not publish it.';

const DRAFT_POST_AGENT_HREF = buildAgentPromptHref(
  'Draft a social post for my brand and hold it for review — do not publish it.',
);

function hasRequiredMcpScopes(apiKey: ApiKey): boolean {
  return API_KEY_SCOPE_PRESETS.mcp.every((scope) =>
    apiKey.scopes.includes(scope),
  );
}

function getVisibleKey(apiKey: ApiKey): string | undefined {
  return apiKey.key ?? apiKey.token;
}

function getBrandSlug(
  brand: ReturnType<typeof useBrand>['brands'][number] | undefined,
): string {
  return typeof brand?.slug === 'string' ? brand.slug : '';
}

export default function ConnectGenfeedFlow() {
  const params = useParams<{ orgSlug: string }>();
  const { brands, isReady, organizationId, settings } = useBrand();
  const [client, setClient] = useState<ConnectGenfeedClient>('codex');
  const [authMethod, setAuthMethod] =
    useState<ConnectGenfeedAuthMethod>('oauth');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [createdPlainKey, setCreatedPlainKey] = useState('');
  const [verificationSecret, setVerificationSecret] = useState('');
  const [verification, setVerification] =
    useState<ConnectGenfeedVerificationResult | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedItem, setCopiedItem] = useState('');
  const hasTrackedStart = useRef(false);
  const deployment = getDeployment();
  const endpoint = EnvironmentService.mcpEndpoint;
  const hasProductApiAccess =
    isSelfHostedDeployment() || hasApiAccess(settings?.subscriptionTier);
  const instructions = buildConnectGenfeedInstructions(
    client,
    endpoint,
    authMethod,
  );
  const selectedKey = apiKeys.find((apiKey) => apiKey.id === selectedKeyId);
  const firstBrandSlug = getBrandSlug(brands[0]);
  const getApiKeysService = useAuthedService(
    useCallback((token: string) => ApiKeysService.getInstance(token), []),
  );

  const trackStep = useCallback(
    (step: ConnectGenfeedStep, outcome?: 'failure' | 'success') => {
      captureAnalyticsEvent(ANALYTICS_EVENTS.CONNECT_GENFEED_STEP, {
        client,
        deployment,
        outcome,
        step,
      });
    },
    [client, deployment],
  );

  const fetchApiKeys = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getApiKeysService();
        const keys = await service.findAll({ limit: 100 });

        if (!signal?.aborted) {
          setApiKeys(keys);
          setSelectedKeyId((current) => {
            if (current && keys.some((key) => key.id === current)) {
              return current;
            }

            return keys.find(hasRequiredMcpScopes)?.id ?? '';
          });
        }
      } catch (error) {
        if (!signal?.aborted) {
          logger.error('Failed to load API keys for Connect Genfeed', error);
          NotificationsService.getInstance().error('Failed to load API keys');
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoadingKeys(false);
        }
      }
    },
    [getApiKeysService],
  );

  useEffect(() => {
    if (!organizationId || !isReady || authMethod !== 'manual-key') {
      return;
    }

    const controller = new AbortController();
    void fetchApiKeys(controller.signal);

    return () => controller.abort();
  }, [authMethod, fetchApiKeys, isReady, organizationId]);

  useEffect(() => {
    if (hasTrackedStart.current) {
      return;
    }

    hasTrackedStart.current = true;
    trackStep('flow_started');
  }, [trackStep]);

  const handleClientChange = (value: string) => {
    const nextClient = value as ConnectGenfeedClient;
    setClient(nextClient);
    setVerification(null);
    captureAnalyticsEvent(ANALYTICS_EVENTS.CONNECT_GENFEED_STEP, {
      client: nextClient,
      deployment,
      step: 'client_selected',
    });
  };

  const handleSelectKey = (apiKey: ApiKey) => {
    setSelectedKeyId(apiKey.id);
    setCreatedPlainKey('');
    setVerificationSecret('');
    setVerification(null);
    trackStep('key_selected');
  };

  const handleCreateKey = async () => {
    if (!hasProductApiAccess) {
      NotificationsService.getInstance().error(
        'API access is available on paid plans.',
      );
      return;
    }

    setIsCreatingKey(true);
    setVerification(null);
    try {
      const service = await getApiKeysService();
      const apiKey = await service.createApiKey({
        description: 'Scoped key created by the Connect Genfeed MCP flow.',
        label: `Connect Genfeed — ${
          CLIENTS.find((item) => item.value === client)?.label ?? 'MCP'
        }`,
        scopes: [...API_KEY_SCOPE_PRESETS.mcp],
      });
      const plainKey = getVisibleKey(apiKey);

      if (!plainKey) {
        throw new Error('API key creation did not return a copy-once key');
      }

      const listItem = new ApiKey({
        ...apiKey,
        key: undefined,
        token: undefined,
      });
      setCreatedPlainKey(plainKey);
      setVerificationSecret(plainKey);
      setSelectedKeyId(apiKey.id);
      setApiKeys((current) => [
        listItem,
        ...current.filter((item) => item.id !== listItem.id),
      ]);
      trackStep('key_created', 'success');
      NotificationsService.getInstance().success('Scoped MCP key created');
    } catch (error) {
      logger.error('Failed to create Connect Genfeed API key', error);
      trackStep('key_created', 'failure');
      NotificationsService.getInstance().error('Failed to create API key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(label);
      trackStep('configuration_copied', 'success');
      NotificationsService.getInstance().success(`${label} copied`);
    } catch (error) {
      logger.error('Failed to copy Connect Genfeed configuration', error);
      trackStep('configuration_copied', 'failure');
      NotificationsService.getInstance().error(`Failed to copy ${label}`);
    }
  };

  const handleVerify = async () => {
    const secret = verificationSecret.trim();
    if (!selectedKey || !secret) {
      setVerification({
        message:
          'Select a key and enter its copy-once value before verification.',
        reason: 'invalid_key',
        status: 'failed',
      });
      return;
    }

    setIsVerifying(true);
    setVerification(null);
    try {
      const service = await getApiKeysService();
      const result = await service.verifyMcpConnection(selectedKey.id, {
        key: secret,
      });
      setVerification(result);
      trackStep(
        'verification',
        result.status === 'connected' ? 'success' : 'failure',
      );

      if (result.status === 'connected') {
        NotificationsService.getInstance().success(
          'Genfeed MCP connection verified',
        );
      }
    } catch (error) {
      const status =
        error &&
        typeof error === 'object' &&
        'status' in error &&
        typeof error.status === 'number'
          ? error.status
          : undefined;
      const hasInvalidKeyFormat = status === 400 || status === 422;

      logger.warn('Connect Genfeed verification request failed', { status });
      setVerification(
        hasInvalidKeyFormat
          ? {
              message:
                'Enter the complete copy-once Genfeed key, including its gf_live_ or gf_test_ prefix.',
              reason: 'invalid_key',
              status: 'failed',
            }
          : {
              message:
                'Verification is temporarily unavailable. Use the manual client check below and try again.',
              reason: 'unreachable_endpoint',
              status: 'failed',
            },
      );
      trackStep('verification', 'failure');
    } finally {
      setIsVerifying(false);
    }
  };

  const publishingHref =
    verification?.status === 'connected' && verification.publishing.isReady
      ? firstBrandSlug
        ? `/${params.orgSlug}/${firstBrandSlug}${DRAFT_POST_AGENT_HREF}`
        : `/${params.orgSlug}/~/publishing`
      : `/${params.orgSlug}/~/settings/brands`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <h1 className="sr-only">Connect Genfeed</h1>

      <ol
        className="grid gap-px bg-border sm:grid-cols-4"
        aria-label="Connection progress"
      >
        {(authMethod === 'oauth'
          ? ['Choose client', 'Add Genfeed', 'Authorize', 'Verify in client']
          : ['Choose client', 'Choose key', 'Copy config', 'Verify']
        ).map((label, index) => (
          <li
            className="bg-card px-4 py-3 text-xs text-muted-foreground"
            key={label}
          >
            <span className="mr-2 font-mono text-foreground">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <Card bodyClassName="p-5" label="1. Choose your MCP client">
        <Tabs
          activeTab={client}
          ariaLabel="MCP client"
          fullWidth={false}
          items={CLIENTS.map((item) => ({
            id: item.value,
            label: item.label,
          }))}
          onTabChange={handleClientChange}
        >
          <p className="pt-2 text-xs text-muted-foreground">
            {CLIENTS.find((item) => item.value === client)?.description}
          </p>
        </Tabs>
      </Card>

      <Tabs
        activeTab={authMethod}
        ariaLabel="Authentication method"
        items={[
          { id: 'oauth', label: 'Browser authorization' },
          { id: 'manual-key', label: 'Advanced: manual API key' },
        ]}
        onTabChange={function handleAuthMethodChange(value) {
          setAuthMethod(value === 'manual-key' ? 'manual-key' : 'oauth');
          setVerification(null);
          setCopiedItem('');
        }}
      />

      {authMethod === 'oauth' ? (
        <Card
          bodyClassName="p-5"
          label="2. Connect with browser authorization"
          description={`Endpoint: ${endpoint}`}
        >
          <p className="text-sm text-muted-foreground">
            Add Genfeed in your client, then approve access in the browser. No
            API key is needed.
          </p>
          <pre className="my-4 overflow-x-auto bg-background p-3 font-mono text-xs">
            <code>{instructions.primaryCommand ?? endpoint}</code>
          </pre>
          <Button
            onClick={() =>
              void copyText(
                'Client setup',
                instructions.primaryCommand ?? endpoint,
              )
            }
            withWrapper={false}
          >
            {instructions.primaryCommand
              ? 'Copy setup command'
              : 'Copy server URL'}
          </Button>
          <p className="mt-4 text-sm">
            {instructions.authorizationInstruction}
          </p>
          <Alert className="mt-4">
            <AlertTitle>Finish connecting in your client</AlertTitle>
            <AlertDescription>
              Complete browser consent, then ask your agent: “List my Genfeed
              brands.” A successful read verifies access.
            </AlertDescription>
          </Alert>
          <p className="mt-4 text-sm text-muted-foreground">
            If access was denied or the login expired, restart authorization in
            your client and approve access. If OAuth is unavailable, update your
            client or choose the advanced manual-key path above.
          </p>
          <p aria-live="polite" className="mt-3 text-xs">
            {copiedItem
              ? `${copiedItem} copied. Complete authorization in your client.`
              : ''}
          </p>
        </Card>
      ) : (
        <>
          <Card
            bodyClassName="p-5"
            label="2. Create or select a scoped key"
            description="The MCP preset includes read, content, analytics, and draft publishing scopes. Existing key values remain copy-once."
          >
            {isLoadingKeys ? (
              <p className="text-sm text-muted-foreground" role="status">
                Loading API keys...
              </p>
            ) : (
              <div className="space-y-3">
                {apiKeys.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {apiKeys.map((apiKey) => {
                      const isSelected = apiKey.id === selectedKeyId;
                      const isScoped = hasRequiredMcpScopes(apiKey);

                      return (
                        <Button
                          aria-pressed={isSelected}
                          className="h-auto min-h-16 justify-between px-3 py-2 text-left"
                          key={apiKey.id}
                          onClick={() => handleSelectKey(apiKey)}
                          variant={
                            isSelected
                              ? ButtonVariant.DEFAULT
                              : ButtonVariant.SECONDARY
                          }
                          withWrapper={false}
                        >
                          <span>
                            <span className="block text-sm font-medium">
                              {apiKey.label ?? 'Unnamed API key'}
                            </span>
                            <span className="mt-1 block text-xs opacity-70">
                              {isScoped
                                ? 'MCP scopes ready'
                                : 'Missing guided-flow scopes'}
                            </span>
                          </span>
                          {isSelected ? (
                            <CircleCheck
                              aria-hidden="true"
                              className="size-5"
                            />
                          ) : (
                            <Key aria-hidden="true" className="size-5" />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active Genfeed API keys yet.
                  </p>
                )}

                <Button
                  icon={<Plus aria-hidden="true" className="size-4" />}
                  isDisabled={!hasProductApiAccess}
                  isLoading={isCreatingKey}
                  onClick={() => void handleCreateKey()}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  Create scoped MCP key
                </Button>

                {!hasProductApiAccess ? (
                  <p className="text-xs text-warning">
                    API access is available on paid cloud plans and all
                    self-hosted deployments.
                  </p>
                ) : null}

                {createdPlainKey ? (
                  <Alert variant="warning">
                    <Key aria-hidden="true" className="size-4" />
                    <AlertTitle>Copy this key now</AlertTitle>
                    <AlertDescription>
                      <p className="break-all font-mono text-xs">
                        {createdPlainKey}
                      </p>
                      <Button
                        className="mt-3"
                        icon={
                          <Clipboard aria-hidden="true" className="size-4" />
                        }
                        onClick={() =>
                          void copyText('API key', createdPlainKey)
                        }
                        variant={ButtonVariant.SECONDARY}
                        withWrapper={false}
                      >
                        Copy API key
                      </Button>
                      <p className="mt-2 text-xs">
                        It will not be shown again after you leave this page.
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            )}
          </Card>

          <Card
            bodyClassName="p-5"
            label="3. Copy secret-safe configuration"
            description={`Endpoint: ${endpoint}`}
          >
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-medium">
                    Enter the key without shell history
                  </h2>
                  <Button
                    ariaLabel="Copy environment variable command"
                    icon={<Clipboard aria-hidden="true" className="size-4" />}
                    onClick={() =>
                      void copyText(
                        'Environment command',
                        instructions.environmentCommand,
                      )
                    }
                    variant={ButtonVariant.GHOST}
                  />
                </div>
                <pre className="overflow-x-auto bg-background p-3 font-mono text-xs text-foreground shadow-border">
                  <code>{instructions.environmentCommand}</code>
                </pre>
              </div>

              {instructions.primaryCommand ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-xs font-medium">Add Genfeed</h2>
                    <Button
                      ariaLabel="Copy client setup command"
                      icon={<Clipboard aria-hidden="true" className="size-4" />}
                      onClick={() =>
                        void copyText(
                          'Client setup command',
                          instructions.primaryCommand ?? '',
                        )
                      }
                      variant={ButtonVariant.GHOST}
                    />
                  </div>
                  <pre className="overflow-x-auto bg-background p-3 font-mono text-xs text-foreground shadow-border">
                    <code>{instructions.primaryCommand}</code>
                  </pre>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-medium">
                    {client === 'codex'
                      ? 'Equivalent config.toml'
                      : 'Configuration'}
                  </h2>
                  <Button
                    ariaLabel="Copy MCP configuration"
                    icon={<Clipboard aria-hidden="true" className="size-4" />}
                    onClick={() =>
                      void copyText(
                        'MCP configuration',
                        instructions.configuration,
                      )
                    }
                    variant={ButtonVariant.GHOST}
                  />
                </div>
                <pre className="overflow-x-auto bg-background p-3 font-mono text-xs text-foreground shadow-border">
                  <code>{instructions.configuration}</code>
                </pre>
              </div>

              <p aria-live="polite" className="text-xs text-success">
                {copiedItem ? `${copiedItem} copied. No key was embedded.` : ''}
              </p>
            </div>
          </Card>

          <Card
            bodyClassName="p-5"
            label="4. Verify the connection"
            description="Genfeed performs a bounded tools/list request against the configured MCP service. The key is never persisted or returned by this check."
          >
            <div className="space-y-4">
              {!createdPlainKey ? (
                <div>
                  <label
                    className="mb-1 block text-xs font-medium"
                    htmlFor="connect-genfeed-key"
                  >
                    Stored value for the selected key
                  </label>
                  <Input
                    autoComplete="off"
                    id="connect-genfeed-key"
                    onChange={(event) =>
                      setVerificationSecret(event.target.value)
                    }
                    placeholder="gf_live_..."
                    type="password"
                    value={verificationSecret}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Existing keys stay copy-once. Enter the value you stored to
                    run the bounded check, or use the manual client command
                    below.
                  </p>
                </div>
              ) : null}

              <Button
                icon={<LinkIcon aria-hidden="true" className="size-4" />}
                isDisabled={!selectedKeyId || !verificationSecret.trim()}
                isLoading={isVerifying}
                onClick={() => void handleVerify()}
                withWrapper={false}
              >
                Verify MCP connection
              </Button>

              {instructions.verifyCommand ? (
                <p className="text-xs text-muted-foreground">
                  Manual fallback:{' '}
                  <code className="font-mono text-foreground">
                    {instructions.verifyCommand}
                  </code>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Manual fallback: run your client&apos;s tool discovery and
                  confirm that Genfeed tools are listed.
                </p>
              )}

              <div aria-live="polite">
                {verification?.status === 'failed' ? (
                  <Alert
                    variant={
                      verification.reason === 'unreachable_endpoint'
                        ? 'warning'
                        : 'destructive'
                    }
                  >
                    <AlertTitle>
                      {verification.reason === 'invalid_scope'
                        ? 'Key scopes need attention'
                        : verification.reason === 'invalid_key'
                          ? 'Key verification failed'
                          : 'Automatic verification unavailable'}
                    </AlertTitle>
                    <AlertDescription>
                      <p>{verification.message}</p>
                      {verification.missingScopes?.length ? (
                        <p className="mt-2 font-mono text-xs">
                          Missing: {verification.missingScopes.join(', ')}
                        </p>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {verification?.status === 'connected' ? (
                  <Alert variant="success">
                    <CircleCheck aria-hidden="true" className="size-4" />
                    <AlertTitle>Connection verified</AlertTitle>
                    <AlertDescription>
                      Genfeed authenticated the selected key and completed MCP
                      tool discovery at{' '}
                      {new Date(verification.verifiedAt).toLocaleString()}.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </div>
          </Card>

          {verification?.status === 'connected' ? (
            <Card
              bodyClassName="p-5"
              label="First distribution action"
              description={
                verification.publishing.isReady
                  ? `${verification.publishing.connectedAccountCount} connected publishing account${
                      verification.publishing.connectedAccountCount === 1
                        ? ''
                        : 's'
                    } ready.`
                  : 'Your MCP connection works, but no publishing integration is connected yet.'
              }
            >
              <div className="space-y-4">
                {verification.publishing.isReady ? (
                  <>
                    <pre className="overflow-x-auto bg-background p-3 font-mono text-xs text-foreground shadow-border">
                      <code>{FIRST_ACTION_PROMPT}</code>
                    </pre>
                    <Button
                      icon={<Clipboard aria-hidden="true" className="size-4" />}
                      onClick={() =>
                        void copyText(
                          'First action prompt',
                          FIRST_ACTION_PROMPT,
                        )
                      }
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                    >
                      Copy first action prompt
                    </Button>
                  </>
                ) : (
                  <Alert variant="warning">
                    <AlertTitle>Connect a publishing account</AlertTitle>
                    <AlertDescription>
                      Add at least one brand social account before asking your
                      MCP client to create a distribution draft.
                    </AlertDescription>
                  </Alert>
                )}

                <Button asChild withWrapper={false}>
                  <Link
                    href={publishingHref}
                    onClick={() => trackStep('publishing_handoff', 'success')}
                  >
                    {verification.publishing.isReady
                      ? firstBrandSlug
                        ? 'Draft a post with the Agent'
                        : 'Open publishing workspace'
                      : 'Connect publishing integration'}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </main>
  );
}
