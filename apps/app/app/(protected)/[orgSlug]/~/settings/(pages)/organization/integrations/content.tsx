'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { hasByokAccess } from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useIsDesktopClient } from '@hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type {
  IntegrationsAction,
  IntegrationsState,
} from '@props/settings/integrations-content.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer } from 'react';

import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import DesktopServerSettings from '@/components/desktop/DesktopServerSettings';
import ByokProviderCard from '../api-keys/byok-provider-card';

const initialState: IntegrationsState = {
  apiKeyInputs: {},
  apiSecretInputs: {},
  expandedProvider: null,
  isLoading: true,
  providerStatuses: [],
  removingProvider: null,
  savingProvider: null,
  validatingProvider: null,
};

function integrationsReducer(
  state: IntegrationsState,
  action: IntegrationsAction,
): IntegrationsState {
  switch (action.type) {
    case 'SET_PROVIDER_STATUSES':
      return { ...state, providerStatuses: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_EXPANDED_PROVIDER':
      return { ...state, expandedProvider: action.payload };
    case 'SET_API_KEY_INPUT':
      return {
        ...state,
        apiKeyInputs: {
          ...state.apiKeyInputs,
          [action.payload.provider]: action.payload.value,
        },
      };
    case 'SET_API_SECRET_INPUT':
      return {
        ...state,
        apiSecretInputs: {
          ...state.apiSecretInputs,
          [action.payload.provider]: action.payload.value,
        },
      };
    case 'SET_SAVING_PROVIDER':
      return { ...state, savingProvider: action.payload };
    case 'SET_VALIDATING_PROVIDER':
      return { ...state, validatingProvider: action.payload };
    case 'SET_REMOVING_PROVIDER':
      return { ...state, removingProvider: action.payload };
    case 'SAVE_SUCCESS':
      return {
        ...state,
        apiKeyInputs: {
          ...state.apiKeyInputs,
          [action.payload.provider]: '',
        },
        apiSecretInputs: {
          ...state.apiSecretInputs,
          [action.payload.provider]: '',
        },
        expandedProvider: null,
        providerStatuses: action.payload.statuses,
      };
    case 'SAVE_DONE':
      return { ...state, savingProvider: null, validatingProvider: null };
    default:
      return state;
  }
}

/** Provider BYOK keys — OpenAI, Replicate, etc. (not Genfeed product API keys). */
export default function SettingsIntegrationsPage() {
  const translate = useTranslations('common.settings.integrations');
  const { organizationId, isReady, settings } = useBrand();
  const { orgHref } = useOrgUrl();
  const desktop = useIsDesktopClient();
  // Cosmetic mirror of the server gate in ByokService: billed deployments
  // include BYOK from Pro upward; self-hosted and desktop are never gated.
  const canAddKey =
    !hasOrganizationBillingHint() || hasByokAccess(settings?.subscriptionTier);
  const [state, dispatch] = useReducer(integrationsReducer, initialState);
  const {
    providerStatuses,
    expandedProvider,
    apiKeyInputs,
    apiSecretInputs,
    savingProvider,
    validatingProvider,
    removingProvider,
    isLoading,
  } = state;

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
          dispatch({ type: 'SET_PROVIDER_STATUSES', payload: statuses });
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch BYOK statuses', error);
          dispatch({ type: 'SET_LOADING', payload: false });
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

    dispatch({ type: 'SET_VALIDATING_PROVIDER', payload: provider });
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
        dispatch({ type: 'SET_VALIDATING_PROVIDER', payload: null });
        return;
      }

      dispatch({ type: 'SET_VALIDATING_PROVIDER', payload: null });
      dispatch({ type: 'SET_SAVING_PROVIDER', payload: provider });

      await service.saveByokProviderKey(
        organizationId,
        provider,
        apiKey,
        apiSecret,
      );
      const statuses = await service.getByokAllProviders(organizationId);
      const providerLabel = providerStatuses.find(
        (p) => p.provider === provider,
      )?.label;
      dispatch({
        type: 'SAVE_SUCCESS',
        payload: { provider, statuses },
      });
      NotificationsService.getInstance().success(
        `${providerLabel ?? 'Provider'} API key saved`,
      );
    } catch (error) {
      logger.error('Failed to save BYOK key', error);
      NotificationsService.getInstance().error('Failed to save API key');
    } finally {
      dispatch({ type: 'SAVE_DONE' });
    }
  };

  const handleRemoveKey = async (provider: string) => {
    if (!organizationId) {
      return;
    }
    dispatch({ type: 'SET_REMOVING_PROVIDER', payload: provider });
    try {
      const service = await getOrganizationsService();
      await service.removeByokProviderKey(organizationId, provider);
      const statuses = await service.getByokAllProviders(organizationId);
      const providerLabel = providerStatuses.find(
        (p) => p.provider === provider,
      )?.label;
      dispatch({ type: 'SET_PROVIDER_STATUSES', payload: statuses });
      NotificationsService.getInstance().success(
        `${providerLabel ?? 'Provider'} API key removed`,
      );
    } catch (error) {
      logger.error('Failed to remove BYOK key', error);
      NotificationsService.getInstance().error('Failed to remove API key');
    } finally {
      dispatch({ type: 'SET_REMOVING_PROVIDER', payload: null });
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <h1 className="sr-only">Integrations</h1>

      {desktop ? <DesktopServerSettings /> : null}
      {desktop ? <DesktopLocalProviderSettings variant="card" /> : null}

      {!desktop && (!isReady || isLoading) ? (
        <div className="flex min-h-40 items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : null}

      {isReady && !canAddKey ? (
        <Alert>
          <Lock className="size-4" aria-hidden="true" />
          <AlertTitle>{translate('byokUpgrade.title')}</AlertTitle>
          <AlertDescription>
            <p>{translate('byokUpgrade.description')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                asChild
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                  {translate('byokUpgrade.action')}
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {isReady && !isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providerStatuses.map((providerStatus) => (
            <ByokProviderCard
              key={providerStatus.provider}
              providerStatus={providerStatus}
              canAddKey={canAddKey}
              cardState={{
                isExpanded: expandedProvider === providerStatus.provider,
                isRemoving: removingProvider === providerStatus.provider,
                isValidating: validatingProvider === providerStatus.provider,
                isSaving: savingProvider === providerStatus.provider,
              }}
              apiKeyValue={apiKeyInputs[providerStatus.provider] ?? ''}
              apiSecretValue={apiSecretInputs[providerStatus.provider] ?? ''}
              onToggleExpand={() =>
                dispatch({
                  type: 'SET_EXPANDED_PROVIDER',
                  payload:
                    expandedProvider === providerStatus.provider
                      ? null
                      : providerStatus.provider,
                })
              }
              onApiKeyChange={(value) =>
                dispatch({
                  type: 'SET_API_KEY_INPUT',
                  payload: { provider: providerStatus.provider, value },
                })
              }
              onApiSecretChange={(value) =>
                dispatch({
                  type: 'SET_API_SECRET_INPUT',
                  payload: { provider: providerStatus.provider, value },
                })
              }
              onValidateAndSave={() =>
                handleValidateAndSave(
                  providerStatus.provider,
                  providerStatus.requiresSecret || false,
                )
              }
              onRemoveKey={() => handleRemoveKey(providerStatus.provider)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
