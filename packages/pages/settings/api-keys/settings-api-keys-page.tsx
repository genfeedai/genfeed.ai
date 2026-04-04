'use client';

import type { IByokProviderStatus } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import AppLink from '@ui/navigation/link/Link';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';
import { HiTrash } from 'react-icons/hi2';

export default function SettingsApiKeysPage() {
  const { organizationId, isReady } = useBrand();

  const [providerStatuses, setProviderStatuses] = useState<
    IByokProviderStatus[]
  >([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [apiSecretInputs, setApiSecretInputs] = useState<
    Record<string, string>
  >({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [validatingProvider, setValidatingProvider] = useState<string | null>(
    null,
  );
  const [removingProvider, setRemovingProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getOrganizationsService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );

  useEffect(() => {
    if (!organizationId || !isReady) {
      return;
    }
    const controller = new AbortController();

    const fetchStatuses = async () => {
      try {
        const service = await getOrganizationsService();
        const statuses = await service.getByokAllProviders(organizationId);

        if (!controller.signal.aborted) {
          setProviderStatuses(statuses);
          setIsLoading(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch BYOK statuses', error);
          setIsLoading(false);
        }
      }
    };

    fetchStatuses();
    return () => controller.abort();
  }, [organizationId, isReady, getOrganizationsService]);

  const _getProviderStatus = (
    provider: string,
  ): IByokProviderStatus | undefined => {
    return providerStatuses.find((s) => s.provider === provider);
  };

  const handleValidateAndSave = async (
    provider: string,
    requiresSecret: boolean,
  ) => {
    if (!organizationId) {
      return;
    }
    const apiKey = apiKeyInputs[provider]?.trim();
    const apiSecret = requiresSecret
      ? apiSecretInputs[provider]?.trim()
      : undefined;
    if (!apiKey || (requiresSecret && !apiSecret)) {
      return;
    }

    setValidatingProvider(provider);
    try {
      const service = await getOrganizationsService();
      const validation = await service.validateByokProviderKey(
        organizationId,
        provider,
        apiKey,
        apiSecret,
      );

      if (!validation.isValid) {
        NotificationsService.getInstance().error(
          validation.error || 'Invalid API key',
        );
        setValidatingProvider(null);
        return;
      }

      setValidatingProvider(null);
      setSavingProvider(provider);

      await service.saveByokProviderKey(
        organizationId,
        provider,
        apiKey,
        apiSecret,
      );
      const statuses = await service.getByokAllProviders(organizationId);
      setProviderStatuses(statuses);
      setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      setApiSecretInputs((prev) => ({ ...prev, [provider]: '' }));
      setExpandedProvider(null);
      NotificationsService.getInstance().success(
        `${providerStatuses.find((p) => p.provider === provider)?.label} API key saved`,
      );
    } catch (error) {
      logger.error('Failed to save BYOK key', error);
      NotificationsService.getInstance().error('Failed to save API key');
    } finally {
      setValidatingProvider(null);
      setSavingProvider(null);
    }
  };

  const handleRemoveKey = async (provider: string) => {
    if (!organizationId) {
      return;
    }
    setRemovingProvider(provider);
    try {
      const service = await getOrganizationsService();
      await service.removeByokProviderKey(organizationId, provider);
      const statuses = await service.getByokAllProviders(organizationId);
      setProviderStatuses(statuses);
      NotificationsService.getInstance().success(
        `${providerStatuses.find((p) => p.provider === provider)?.label} API key removed`,
      );
    } catch (error) {
      logger.error('Failed to remove BYOK key', error);
      NotificationsService.getInstance().error('Failed to remove API key');
    } finally {
      setRemovingProvider(null);
    }
  };

  if (!isReady || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bring your own API keys for AI providers. When using your own key, no
          credits are deducted.
        </p>
      </div>

      {providerStatuses.map((providerStatus) => {
        const isExpanded = expandedProvider === providerStatus.provider;
        const isConnected = providerStatus.hasKey && providerStatus.isEnabled;

        return (
          <Card key={providerStatus.provider} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">{providerStatus.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {providerStatus.description}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-green-500">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Connected
                    </span>
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() =>
                        setExpandedProvider(
                          isExpanded ? null : providerStatus.provider,
                        )
                      }
                    >
                      {isExpanded ? 'Cancel' : 'Replace Key'}
                    </Button>
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => handleRemoveKey(providerStatus.provider)}
                      isDisabled={removingProvider === providerStatus.provider}
                    >
                      <HiTrash className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                      Not configured
                    </span>
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() =>
                        setExpandedProvider(
                          isExpanded ? null : providerStatus.provider,
                        )
                      }
                    >
                      Add Key
                    </Button>
                  </>
                )}
              </div>
            </div>

            {isConnected && !isExpanded && providerStatus.maskedKey && (
              <p className="text-xs text-muted-foreground font-mono mt-2">
                {providerStatus.maskedKey}
              </p>
            )}

            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      API Key
                    </label>
                    <Input
                      type="password"
                      value={apiKeyInputs[providerStatus.provider] || ''}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({
                          ...prev,
                          [providerStatus.provider]: e.target.value,
                        }))
                      }
                      placeholder="Enter API key..."
                      className="w-full"
                    />
                  </div>
                  {providerStatus.requiresSecret && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        API Secret
                      </label>
                      <Input
                        type="password"
                        value={apiSecretInputs[providerStatus.provider] || ''}
                        onChange={(e) =>
                          setApiSecretInputs((prev) => ({
                            ...prev,
                            [providerStatus.provider]: e.target.value,
                          }))
                        }
                        placeholder="Enter API secret..."
                        className="w-full"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <AppLink
                      url={providerStatus.docsUrl}
                      label="Get API key"
                      variant={ButtonVariant.LINK}
                      className="text-xs"
                      target="_blank"
                    />
                    <Button
                      onClick={() =>
                        handleValidateAndSave(
                          providerStatus.provider,
                          providerStatus.requiresSecret || false,
                        )
                      }
                      isDisabled={
                        !apiKeyInputs[providerStatus.provider]?.trim() ||
                        (providerStatus.requiresSecret &&
                          !apiSecretInputs[providerStatus.provider]?.trim()) ||
                        validatingProvider === providerStatus.provider ||
                        savingProvider === providerStatus.provider
                      }
                    >
                      {validatingProvider === providerStatus.provider
                        ? 'Validating...'
                        : savingProvider === providerStatus.provider
                          ? 'Saving...'
                          : 'Validate & Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
