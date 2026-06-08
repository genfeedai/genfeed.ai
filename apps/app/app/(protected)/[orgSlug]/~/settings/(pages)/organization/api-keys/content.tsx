'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useCallback, useEffect, useState } from 'react';
import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import { isSelfHosted } from '@/lib/config/edition';
import { isDesktopShell } from '@/lib/desktop/runtime';
import ApiKeysHeader from './api-keys-header';
import ByokProviderCard from './byok-provider-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

export default function SettingsApiKeysPage() {
  const { organizationId, isReady } = useBrand();
  const desktop = isDesktopShell();

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

  if (!desktop && (!isReady || isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {desktop ? <DesktopLocalProviderSettings variant="card" /> : null}
      {isSelfHosted() ? <ManagedCreditsCheckoutCard /> : null}

      <ApiKeysHeader />

      {isReady && !isLoading
        ? providerStatuses.map((providerStatus) => (
            <ByokProviderCard
              key={providerStatus.provider}
              providerStatus={providerStatus}
              isExpanded={expandedProvider === providerStatus.provider}
              apiKeyValue={apiKeyInputs[providerStatus.provider] ?? ''}
              apiSecretValue={apiSecretInputs[providerStatus.provider] ?? ''}
              isRemoving={removingProvider === providerStatus.provider}
              isValidating={validatingProvider === providerStatus.provider}
              isSaving={savingProvider === providerStatus.provider}
              onToggleExpand={() =>
                setExpandedProvider(
                  expandedProvider === providerStatus.provider
                    ? null
                    : providerStatus.provider,
                )
              }
              onApiKeyChange={(value) =>
                setApiKeyInputs((prev) => ({
                  ...prev,
                  [providerStatus.provider]: value,
                }))
              }
              onApiSecretChange={(value) =>
                setApiSecretInputs((prev) => ({
                  ...prev,
                  [providerStatus.provider]: value,
                }))
              }
              onValidateAndSave={() =>
                handleValidateAndSave(
                  providerStatus.provider,
                  providerStatus.requiresSecret || false,
                )
              }
              onRemoveKey={() => handleRemoveKey(providerStatus.provider)}
            />
          ))
        : null}
    </div>
  );
}
