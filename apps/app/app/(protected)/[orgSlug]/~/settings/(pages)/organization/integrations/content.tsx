'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import type { IByokProviderStatus } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useCallback, useEffect, useReducer } from 'react';

import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import ByokProviderCard from '../api-keys/byok-provider-card';

type IntegrationsState = {
  providerStatuses: IByokProviderStatus[];
  expandedProvider: string | null;
  apiKeyInputs: Record<string, string>;
  apiSecretInputs: Record<string, string>;
  savingProvider: string | null;
  validatingProvider: string | null;
  removingProvider: string | null;
  isLoading: boolean;
};

type IntegrationsAction =
  | { type: 'SET_PROVIDER_STATUSES'; payload: IByokProviderStatus[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_EXPANDED_PROVIDER'; payload: string | null }
  | { type: 'SET_API_KEY_INPUT'; payload: { provider: string; value: string } }
  | {
      type: 'SET_API_SECRET_INPUT';
      payload: { provider: string; value: string };
    }
  | { type: 'SET_SAVING_PROVIDER'; payload: string | null }
  | { type: 'SET_VALIDATING_PROVIDER'; payload: string | null }
  | { type: 'SET_REMOVING_PROVIDER'; payload: string | null }
  | {
      type: 'SAVE_SUCCESS';
      payload: {
        provider: string;
        statuses: IByokProviderStatus[];
      };
    }
  | { type: 'SAVE_DONE' };

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
  const { organizationId, isReady } = useBrand();
  const desktop = isDesktopClient();
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

      {desktop ? <DesktopLocalProviderSettings variant="card" /> : null}

      {!desktop && (!isReady || isLoading) ? (
        <div className="flex min-h-40 items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : null}

      {isReady && !isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providerStatuses.map((providerStatus) => (
            <ByokProviderCard
              key={providerStatus.provider}
              providerStatus={providerStatus}
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
