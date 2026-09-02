'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  API_KEY_SCOPE_OPTIONS,
  API_KEY_SCOPE_PRESETS,
  APP_ROUTES,
} from '@genfeedai/contracts/constants';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { hasApiAccess } from '@genfeedai/pricing';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ApiKeysService } from '@services/management/api-keys.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Clipboard, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const PRODUCT_API_KEY_PRESETS = [
  { label: 'MCP', scopes: API_KEY_SCOPE_PRESETS.mcp },
  { label: 'Read', scopes: API_KEY_SCOPE_PRESETS.read },
  { label: 'Content', scopes: API_KEY_SCOPE_PRESETS.content },
] as const;

const SECONDARY_BUTTON_VARIANT = ButtonVariant.SECONDARY;

function scopesExactlyMatch(
  selected: readonly string[],
  preset: readonly string[],
): boolean {
  if (selected.length !== preset.length) {
    return false;
  }
  const selectedSet = new Set(selected);
  return preset.every((scope) => selectedSet.has(scope));
}

const initialProductApiKeyForm: ProductApiKeyForm = {
  allowedIps: '',
  description: '',
  expiresAt: '',
  label: '',
  rateLimit: '',
  selectedScopes: [...API_KEY_SCOPE_PRESETS.mcp],
};

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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function formatLastUsed(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function getVisibleKey(apiKey: ApiKey): string | undefined {
  return apiKey.key ?? apiKey.token;
}

const API_ACCESS_UPGRADE_TIER_LABEL = 'Pro';

export default function SettingsApiKeysPage() {
  const { organizationId, isReady, settings } = useBrand();
  const { orgHref } = useOrgUrl();
  const selfHostedDeployment = isSelfHostedDeployment();
  const hasProductApiAccess =
    selfHostedDeployment || hasApiAccess(settings?.subscriptionTier);

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

      return {
        ...current,
        // Always allocate a new array so React always sees a state change.
        selectedScopes: Array.from(nextScopes),
      };
    });
  };

  const handlePresetSelect = (scopes: readonly ProductApiKeyScope[]) => {
    setProductForm((current) => {
      // Clicking the active preset again is a no-op (keep selection).
      if (scopesExactlyMatch(current.selectedScopes, scopes)) {
        return current;
      }
      return {
        ...current,
        selectedScopes: [...scopes],
      };
    });
  };

  const handleCreateProductKey = async () => {
    if (!hasProductApiAccess) {
      NotificationsService.getInstance().error(
        'API access is available on paid plans.',
      );
      return;
    }

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

  if (isReady && !hasProductApiAccess) {
    return (
      <div className="space-y-4 pb-10">
        <h1 className="sr-only">API Keys</h1>
        <CardEmpty
          actions={
            <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                Upgrade to {API_ACCESS_UPGRADE_TIER_LABEL}
              </Link>
            </Button>
          }
          description={`API access is included on paid plans. Upgrade to ${API_ACCESS_UPGRADE_TIER_LABEL} to create Genfeed API keys for CLI, MCP, and unattended workflows.`}
          icon={Lock}
          label={`Unlock API keys with ${API_ACCESS_UPGRADE_TIER_LABEL}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <h1 className="sr-only">API Keys</h1>

      {isReady ? (
        <Card
          label="API keys"
          description="Use these keys for CLI profiles, MCP servers, and unattended workflows."
          bodyClassName="gap-3 p-4"
          headerAction={
            <Button
              variant={SECONDARY_BUTTON_VARIANT}
              onClick={() => fetchProductApiKeys()}
              isDisabled={isProductLoading}
              aria-label="Refresh Genfeed API keys"
            >
              <RefreshCw className="size-4" />
            </Button>
          }
        >
          {productPlainKey ? (
            <div className="mt-4 border-t border-border pt-3">
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
                  <Clipboard className="size-4" />
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
            <div>
              <span className="mb-1.5 block text-xs text-muted-foreground">
                Scope preset
              </span>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_API_KEY_PRESETS.map((preset) => {
                  const isActive = scopesExactlyMatch(
                    productForm.selectedScopes,
                    preset.scopes,
                  );

                  return (
                    <Button
                      key={preset.label}
                      type="button"
                      size={ButtonSize.SM}
                      withWrapper={false}
                      textTransform="none"
                      aria-pressed={isActive}
                      variant={
                        isActive ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
                      }
                      className={cn(
                        'h-8 rounded-md border px-3 text-xs font-medium',
                        isActive
                          ? 'border-foreground/25 bg-foreground/[0.08] text-foreground'
                          : 'border-border text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground',
                      )}
                      onClick={() => handlePresetSelect(preset.scopes)}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {API_KEY_SCOPE_OPTIONS.map((option) => {
                const selectedCount = option.scopes.filter((scope) =>
                  selectedScopeSet.has(scope),
                ).length;
                const isFullySelected = selectedCount === option.scopes.length;
                const isPartiallySelected =
                  selectedCount > 0 && !isFullySelected;

                return (
                  <div
                    key={option.label}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                      isFullySelected
                        ? 'border-foreground/20 bg-foreground/[0.04]'
                        : isPartiallySelected
                          ? 'border-border bg-muted/20'
                          : 'border-border',
                    )}
                  >
                    <Checkbox
                      checked={
                        isFullySelected
                          ? true
                          : isPartiallySelected
                            ? 'indeterminate'
                            : false
                      }
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
                !hasProductApiAccess ||
                !productForm.label.trim() ||
                productForm.selectedScopes.length === 0
              }
            >
              <Plus className="size-4" />
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
                        <RefreshCw className="size-4" />
                        Rotate
                      </Button>
                      <Button
                        variant={SECONDARY_BUTTON_VARIANT}
                        onClick={() => handleRevokeProductKey(apiKey)}
                        isDisabled={mutatingProductKeyId === apiKey.id}
                      >
                        <Trash2 className="size-4" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="flex min-h-40 items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
