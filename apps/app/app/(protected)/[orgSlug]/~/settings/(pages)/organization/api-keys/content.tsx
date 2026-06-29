'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants/api-key-presets.constant';
import type { ButtonVariant } from '@genfeedai/enums';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ApiKeysService } from '@services/management/api-keys.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  HiArrowPath,
  HiClipboardDocument,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';
import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import { isSelfHosted } from '@/lib/config/edition';
import { isDesktopShell } from '@/lib/desktop/runtime';
import ApiKeysHeader from './api-keys-header';
import ByokProviderCard from './byok-provider-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

type ApiKeysState = {
  providerStatuses: IByokProviderStatus[];
  expandedProvider: string | null;
  apiKeyInputs: Record<string, string>;
  apiSecretInputs: Record<string, string>;
  savingProvider: string | null;
  validatingProvider: string | null;
  removingProvider: string | null;
  isLoading: boolean;
};

type ApiKeysAction =
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

type ProductApiKeyForm = {
  allowedIps: string;
  description: string;
  expiresAt: string;
  label: string;
  rateLimit: string;
  selectedScopes: string[];
};

type ProductPlainKey = {
  key: string;
  label: string;
};

type ProductApiKeyScope =
  (typeof API_KEY_SCOPE_PRESETS)[keyof typeof API_KEY_SCOPE_PRESETS][number];

const SECONDARY_BUTTON_VARIANT = 'secondary' as ButtonVariant;

const API_KEY_SCOPE_OPTIONS = [
  {
    label: 'Videos',
    scopes: ['videos:read', 'videos:create'],
  },
  {
    label: 'Images',
    scopes: ['images:read', 'images:create'],
  },
  {
    label: 'Prompts',
    scopes: ['prompts:read', 'prompts:create'],
  },
  {
    label: 'Articles',
    scopes: ['articles:read', 'articles:create'],
  },
  { label: 'Posts', scopes: ['posts:create'] },
  { label: 'Brands', scopes: ['brands:read'] },
  { label: 'Credits', scopes: ['credits:read'] },
  { label: 'Analytics', scopes: ['analytics:read'] },
] as const;

const PRODUCT_API_KEY_PRESETS = [
  { label: 'MCP', scopes: API_KEY_SCOPE_PRESETS.mcp },
  { label: 'Read', scopes: API_KEY_SCOPE_PRESETS.read },
  { label: 'Content', scopes: API_KEY_SCOPE_PRESETS.content },
] as const;

const initialProductApiKeyForm: ProductApiKeyForm = {
  allowedIps: '',
  description: '',
  expiresAt: '',
  label: '',
  rateLimit: '',
  selectedScopes: [...API_KEY_SCOPE_PRESETS.mcp],
};

const initialApiKeysState: ApiKeysState = {
  providerStatuses: [],
  expandedProvider: null,
  apiKeyInputs: {},
  apiSecretInputs: {},
  savingProvider: null,
  validatingProvider: null,
  removingProvider: null,
  isLoading: true,
};

function apiKeysReducer(
  state: ApiKeysState,
  action: ApiKeysAction,
): ApiKeysState {
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
        providerStatuses: action.payload.statuses,
        apiKeyInputs: {
          ...state.apiKeyInputs,
          [action.payload.provider]: '',
        },
        apiSecretInputs: {
          ...state.apiSecretInputs,
          [action.payload.provider]: '',
        },
        expandedProvider: null,
      };
    case 'SAVE_DONE':
      return { ...state, savingProvider: null, validatingProvider: null };
    default:
      return state;
  }
}

function parseCommaSeparated(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function parseExpiresAt(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
}

function formatLastUsed(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function getVisibleKey(apiKey: ApiKey): string | undefined {
  return apiKey.key ?? apiKey.token;
}

export default function SettingsApiKeysPage() {
  const { organizationId, isReady } = useBrand();
  const desktop = isDesktopShell();

  const [state, dispatch] = useReducer(apiKeysReducer, initialApiKeysState);
  const [productApiKeys, setProductApiKeys] = useState<ApiKey[]>([]);
  const [productForm, setProductForm] = useState<ProductApiKeyForm>(
    initialProductApiKeyForm,
  );
  const [productPlainKey, setProductPlainKey] =
    useState<ProductPlainKey | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [isCreatingProductKey, setIsCreatingProductKey] = useState(false);
  const [mutatingProductKeyId, setMutatingProductKeyId] = useState<
    string | null
  >(null);
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
  const getApiKeysService = useAuthedService(
    useCallback((token: string) => ApiKeysService.getInstance(token), []),
  );

  const selectedScopeSet = useMemo(
    () => new Set(productForm.selectedScopes),
    [productForm.selectedScopes],
  );

  const fetchProductApiKeys = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getApiKeysService();
        const apiKeys = await service.findAll({ limit: 100 });

        if (!signal?.aborted) {
          setProductApiKeys(apiKeys);
          setIsProductLoading(false);
        }
      } catch (error) {
        if (!signal?.aborted) {
          logger.error('Failed to fetch Genfeed API keys', error);
          NotificationsService.getInstance().error('Failed to load API keys');
          setIsProductLoading(false);
        }
      }
    },
    [getApiKeysService],
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

  useEffect(() => {
    if (!organizationId || !isReady) {
      setProductApiKeys([]);
      setProductPlainKey(null);
      setIsProductLoading(false);
      return;
    }
    const controller = new AbortController();

    setProductApiKeys([]);
    setProductPlainKey(null);
    setIsProductLoading(true);
    fetchProductApiKeys(controller.signal);
    return () => controller.abort();
  }, [organizationId, isReady, fetchProductApiKeys]);

  const handleProductFormChange = (
    field: keyof Omit<ProductApiKeyForm, 'selectedScopes'>,
    value: string,
  ) => {
    setProductForm((current) => ({ ...current, [field]: value }));
  };

  const handleScopeToggle = (scopes: readonly ProductApiKeyScope[]) => {
    setProductForm((current) => {
      const nextScopes = new Set(current.selectedScopes);
      const allSelected = scopes.every((scope) => nextScopes.has(scope));

      for (const scope of scopes) {
        if (allSelected) {
          nextScopes.delete(scope);
        } else {
          nextScopes.add(scope);
        }
      }

      return { ...current, selectedScopes: [...nextScopes] };
    });
  };

  const handlePresetSelect = (scopes: readonly ProductApiKeyScope[]) => {
    setProductForm((current) => ({
      ...current,
      selectedScopes: [...scopes],
    }));
  };

  const handleCreateProductKey = async () => {
    const label = productForm.label.trim();
    if (!label || productForm.selectedScopes.length === 0) {
      return;
    }

    setIsCreatingProductKey(true);
    try {
      const service = await getApiKeysService();
      const apiKey = await service.createApiKey({
        allowedIps: parseCommaSeparated(productForm.allowedIps),
        description: productForm.description.trim() || undefined,
        expiresAt: parseExpiresAt(productForm.expiresAt),
        label,
        rateLimit: productForm.rateLimit
          ? Number.parseInt(productForm.rateLimit, 10)
          : undefined,
        scopes: productForm.selectedScopes,
      });
      const key = getVisibleKey(apiKey);

      if (key) {
        setProductPlainKey({ key, label: apiKey.label ?? label });
      }

      setProductForm(initialProductApiKeyForm);
      await fetchProductApiKeys();
      NotificationsService.getInstance().success('API key created');
    } catch (error) {
      logger.error('Failed to create Genfeed API key', error);
      NotificationsService.getInstance().error('Failed to create API key');
    } finally {
      setIsCreatingProductKey(false);
    }
  };

  const handleCopyProductKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      NotificationsService.getInstance().success('API key copied');
    } catch (error) {
      logger.error('Failed to copy Genfeed API key', error);
      NotificationsService.getInstance().error('Failed to copy API key');
    }
  };

  const handleRotateProductKey = async (apiKey: ApiKey) => {
    setMutatingProductKeyId(apiKey.id);
    try {
      const service = await getApiKeysService();
      const rotatedKey = await service.rotateApiKey(apiKey.id);
      const key = getVisibleKey(rotatedKey);

      if (key) {
        setProductPlainKey({
          key,
          label: rotatedKey.label ?? apiKey.label ?? 'Rotated key',
        });
      }

      await fetchProductApiKeys();
      NotificationsService.getInstance().success('API key rotated');
    } catch (error) {
      logger.error('Failed to rotate Genfeed API key', error);
      NotificationsService.getInstance().error('Failed to rotate API key');
    } finally {
      setMutatingProductKeyId(null);
    }
  };

  const handleRevokeProductKey = async (apiKey: ApiKey) => {
    setMutatingProductKeyId(apiKey.id);
    try {
      const service = await getApiKeysService();
      await service.revokeApiKey(apiKey.id);
      await fetchProductApiKeys();
      NotificationsService.getInstance().success('API key revoked');
    } catch (error) {
      logger.error('Failed to revoke Genfeed API key', error);
      NotificationsService.getInstance().error('Failed to revoke API key');
    } finally {
      setMutatingProductKeyId(null);
    }
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
      dispatch({ type: 'SAVE_SUCCESS', payload: { provider, statuses } });
      NotificationsService.getInstance().success(
        `${providerLabel} API key saved`,
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
        `${providerLabel} API key removed`,
      );
    } catch (error) {
      logger.error('Failed to remove BYOK key', error);
      NotificationsService.getInstance().error('Failed to remove API key');
    } finally {
      dispatch({ type: 'SET_REMOVING_PROVIDER', payload: null });
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

      {isReady ? (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium">Genfeed API keys</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Use these keys for CLI profiles, MCP servers, and unattended
                workflows.
              </p>
            </div>
            <Button
              variant={SECONDARY_BUTTON_VARIANT}
              onClick={() => fetchProductApiKeys()}
              isDisabled={isProductLoading}
              aria-label="Refresh Genfeed API keys"
            >
              <HiArrowPath className="size-4" />
            </Button>
          </div>

          {productPlainKey ? (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{productPlainKey.label}</p>
                  <p className="mt-1 font-mono text-xs break-all">
                    {productPlainKey.key}
                  </p>
                </div>
                <Button
                  variant={SECONDARY_BUTTON_VARIANT}
                  onClick={() => handleCopyProductKey(productPlainKey.key)}
                >
                  <HiClipboardDocument className="size-4" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Store this key now. It will not be shown again.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                Key name
              </span>
              <Input
                value={productForm.label}
                onChange={(event) =>
                  handleProductFormChange('label', event.target.value)
                }
                placeholder="MCP Server"
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                Expires
              </span>
              <Input
                type="date"
                value={productForm.expiresAt}
                onChange={(event) =>
                  handleProductFormChange('expiresAt', event.target.value)
                }
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                Rate limit
              </span>
              <Input
                type="number"
                min="1"
                value={productForm.rateLimit}
                onChange={(event) =>
                  handleProductFormChange('rateLimit', event.target.value)
                }
                placeholder="60"
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                Allowed IPs
              </span>
              <Input
                value={productForm.allowedIps}
                onChange={(event) =>
                  handleProductFormChange('allowedIps', event.target.value)
                }
                placeholder="203.0.113.10, 203.0.113.11"
              />
            </div>
            <div className="md:col-span-2">
              <span className="text-xs text-muted-foreground mb-1 block">
                Description
              </span>
              <Input
                value={productForm.description}
                onChange={(event) =>
                  handleProductFormChange('description', event.target.value)
                }
                placeholder="Used by local MCP server"
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRODUCT_API_KEY_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={SECONDARY_BUTTON_VARIANT}
                  onClick={() => handlePresetSelect(preset.scopes)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {API_KEY_SCOPE_OPTIONS.map((option) => {
                const checked = option.scopes.every((scope) =>
                  selectedScopeSet.has(scope),
                );

                return (
                  <div
                    key={option.label}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
                  >
                    <Checkbox
                      isChecked={checked}
                      label={option.label}
                      onCheckedChange={() => handleScopeToggle(option.scopes)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleCreateProductKey}
              isDisabled={
                isCreatingProductKey ||
                !productForm.label.trim() ||
                productForm.selectedScopes.length === 0
              }
            >
              <HiPlus className="size-4" />
              {isCreatingProductKey ? 'Creating...' : 'Create Key'}
            </Button>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            {isProductLoading ? (
              <p className="text-sm text-muted-foreground">Loading keys...</p>
            ) : productApiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active Genfeed API keys.
              </p>
            ) : (
              <div className="space-y-3">
                {productApiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {apiKey.label ?? 'Untitled key'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last used: {formatLastUsed(apiKey.lastUsedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(apiKey.scopes ?? []).join(', ') || 'No scopes'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={SECONDARY_BUTTON_VARIANT}
                        onClick={() => handleRotateProductKey(apiKey)}
                        isDisabled={mutatingProductKeyId === apiKey.id}
                      >
                        <HiArrowPath className="size-4" />
                        Rotate
                      </Button>
                      <Button
                        variant={SECONDARY_BUTTON_VARIANT}
                        onClick={() => handleRevokeProductKey(apiKey)}
                        isDisabled={mutatingProductKeyId === apiKey.id}
                      >
                        <HiTrash className="size-4" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {isReady && !isLoading
        ? providerStatuses.map((providerStatus) => (
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
          ))
        : null}
    </div>
  );
}
