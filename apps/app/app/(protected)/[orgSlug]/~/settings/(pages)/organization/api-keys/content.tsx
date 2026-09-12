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
import type {
  ProductApiKeyForm,
  ProductApiKeyScope,
  ProductPlainKey,
} from '@props/settings/api-keys-content.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ApiKeysService } from '@services/management/api-keys.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Clipboard,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PRODUCT_API_KEY_PRESETS = [
  { labelKey: 'presets.mcp', scopes: API_KEY_SCOPE_PRESETS.mcp },
  { labelKey: 'presets.read', scopes: API_KEY_SCOPE_PRESETS.read },
  { labelKey: 'presets.content', scopes: API_KEY_SCOPE_PRESETS.content },
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

function createInitialProductApiKeyForm(label: string): ProductApiKeyForm {
  return {
    allowedIps: '',
    description: '',
    expiresAt: '',
    label,
    rateLimit: '',
    selectedScopes: [...API_KEY_SCOPE_PRESETS.mcp],
  };
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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function formatLastUsed(
  value: string | null | undefined,
  neverLabel: string,
): string {
  return value ? new Date(value).toLocaleString() : neverLabel;
}

function getVisibleKey(apiKey: ApiKey): string | undefined {
  return apiKey.key ?? apiKey.token;
}

const API_ACCESS_UPGRADE_TIER_LABEL = 'Pro';

export default function SettingsApiKeysPage() {
  const translate = useTranslations('common.settings.apiKeys');
  const { organizationId, isReady, settings } = useBrand();
  const { orgHref } = useOrgUrl();
  const selfHostedDeployment = isSelfHostedDeployment();
  const hasProductApiAccess =
    selfHostedDeployment || hasApiAccess(settings?.subscriptionTier);
  const defaultKeyName = translate('fields.keyNamePlaceholder');
  const loadErrorMessage = translate('errors.load');

  const [productApiKeys, setProductApiKeys] = useState<ApiKey[]>(() => []);
  const [productForm, setProductForm] = useState<ProductApiKeyForm>(() =>
    createInitialProductApiKeyForm(defaultKeyName),
  );
  const [productPlainKey, setProductPlainKey] =
    useState<ProductPlainKey | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [hasProductKeysLoadError, setHasProductKeysLoadError] = useState(false);
  const [isCreatingProductKey, setIsCreatingProductKey] = useState(false);
  const [mutatingProductKeyId, setMutatingProductKeyId] = useState<
    string | null
  >(null);
  const getApiKeysService = useAuthedService(
    useCallback((token: string) => ApiKeysService.getInstance(token), []),
  );
  const productKeysFetchIdRef = useRef(0);

  const selectedScopeSet = useMemo(
    () => new Set(productForm.selectedScopes),
    [productForm.selectedScopes],
  );

  const fetchProductApiKeys = useCallback(
    async (signal?: AbortSignal) => {
      const fetchId = productKeysFetchIdRef.current + 1;
      productKeysFetchIdRef.current = fetchId;
      const isCurrentFetch = () =>
        productKeysFetchIdRef.current === fetchId && !signal?.aborted;

      if (isCurrentFetch()) {
        setIsProductLoading(true);
        setHasProductKeysLoadError(false);
      }
      try {
        const service = await getApiKeysService();
        const apiKeys = await service.findAll({ limit: 100 }, signal);

        if (isCurrentFetch()) {
          setProductApiKeys(Array.isArray(apiKeys) ? apiKeys : []);
          setHasProductKeysLoadError(false);
        }
      } catch (error) {
        if (isCurrentFetch()) {
          logger.error('Failed to fetch Genfeed API keys', error);
          NotificationsService.getInstance().error(loadErrorMessage);
          setProductApiKeys([]);
          setHasProductKeysLoadError(true);
        }
      } finally {
        if (isCurrentFetch()) {
          setIsProductLoading(false);
        }
      }
    },
    [getApiKeysService, loadErrorMessage],
  );

  useEffect(() => {
    if (!organizationId || !isReady) {
      setProductApiKeys([]);
      setProductPlainKey(null);
      setHasProductKeysLoadError(false);
      setIsProductLoading(false);
      return;
    }
    const controller = new AbortController();

    setProductApiKeys([]);
    setProductPlainKey(null);
    setHasProductKeysLoadError(false);
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
        translate('errors.paidPlanRequired'),
      );
      return;
    }

    const label = productForm.label.trim() || defaultKeyName;
    if (productForm.selectedScopes.length === 0) {
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

      setProductForm(createInitialProductApiKeyForm(defaultKeyName));
      await fetchProductApiKeys();
      NotificationsService.getInstance().success(translate('success.created'));
    } catch (error) {
      logger.error('Failed to create Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.create'));
    } finally {
      setIsCreatingProductKey(false);
    }
  };

  const handleCopyProductKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      NotificationsService.getInstance().success(translate('success.copied'));
    } catch (error) {
      logger.error('Failed to copy Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.copy'));
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
          label:
            rotatedKey.label ?? apiKey.label ?? translate('plainKey.rotated'),
        });
      }

      await fetchProductApiKeys();
      NotificationsService.getInstance().success(translate('success.rotated'));
    } catch (error) {
      logger.error('Failed to rotate Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.rotate'));
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
      NotificationsService.getInstance().success(translate('success.revoked'));
    } catch (error) {
      logger.error('Failed to revoke Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.revoke'));
    } finally {
      setMutatingProductKeyId(null);
    }
  };

  if (isReady && !hasProductApiAccess) {
    return (
      <div className="space-y-4 pb-10">
        <h1 className="sr-only">{translate('title')}</h1>
        <CardEmpty
          actions={
            <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                {translate('actions.upgrade', {
                  tier: API_ACCESS_UPGRADE_TIER_LABEL,
                })}
              </Link>
            </Button>
          }
          description={translate('upgrade.description', {
            tier: API_ACCESS_UPGRADE_TIER_LABEL,
          })}
          icon={Lock}
          label={translate('upgrade.label', {
            tier: API_ACCESS_UPGRADE_TIER_LABEL,
          })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      {isReady ? (
        <Card
          label={translate('card.title')}
          description={translate('card.description')}
          bodyClassName="gap-3 p-4"
          headerAction={
            <Button
              variant={SECONDARY_BUTTON_VARIANT}
              onClick={() => fetchProductApiKeys()}
              isDisabled={isProductLoading}
              aria-label={translate('actions.refreshAria')}
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
                  {translate('actions.copy')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {translate('plainKey.notice')}
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                {translate('fields.keyName')}
              </span>
              <Input
                value={productForm.label}
                onChange={(event) =>
                  handleProductFormChange('label', event.target.value)
                }
                placeholder={translate('fields.keyNamePlaceholder')}
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                {translate('fields.expires')}
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
                {translate('fields.rateLimit')}
              </span>
              <Input
                type="number"
                min="1"
                value={productForm.rateLimit}
                onChange={(event) =>
                  handleProductFormChange('rateLimit', event.target.value)
                }
                placeholder={translate('fields.rateLimitPlaceholder')}
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
                {translate('fields.allowedIps')}
              </span>
              <Input
                value={productForm.allowedIps}
                onChange={(event) =>
                  handleProductFormChange('allowedIps', event.target.value)
                }
                placeholder={translate('fields.allowedIpsPlaceholder')}
              />
            </div>
            <div className="md:col-span-2">
              <span className="text-xs text-muted-foreground mb-1 block">
                {translate('fields.description')}
              </span>
              <Input
                value={productForm.description}
                onChange={(event) =>
                  handleProductFormChange('description', event.target.value)
                }
                placeholder={translate('fields.descriptionPlaceholder')}
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <span className="mb-1.5 block text-xs text-muted-foreground">
                {translate('fields.scopePreset')}
              </span>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_API_KEY_PRESETS.map((preset) => {
                  const isActive = scopesExactlyMatch(
                    productForm.selectedScopes,
                    preset.scopes,
                  );

                  return (
                    <Button
                      key={preset.labelKey}
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
                      {translate(preset.labelKey)}
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
                productForm.selectedScopes.length === 0
              }
            >
              <Plus className="size-4" />
              {isCreatingProductKey
                ? translate('actions.creating')
                : translate('actions.create')}
            </Button>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            {isProductLoading ? (
              <p className="text-sm text-muted-foreground">
                {translate('list.loading')}
              </p>
            ) : hasProductKeysLoadError ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertTitle>{translate('errors.loadTitle')}</AlertTitle>
                <AlertDescription>
                  {translate('errors.loadDescription')}
                </AlertDescription>
              </Alert>
            ) : productApiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate('empty')}
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
                        {apiKey.label ?? translate('list.untitled')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {translate('list.lastUsed', {
                          value: formatLastUsed(
                            apiKey.lastUsedAt,
                            translate('list.never'),
                          ),
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(apiKey.scopes ?? []).join(', ') ||
                          translate('list.noScopes')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={SECONDARY_BUTTON_VARIANT}
                        onClick={() => handleRotateProductKey(apiKey)}
                        isDisabled={mutatingProductKeyId === apiKey.id}
                      >
                        <RefreshCw className="size-4" />
                        {translate('actions.rotate')}
                      </Button>
                      <Button
                        variant={SECONDARY_BUTTON_VARIANT}
                        onClick={() => handleRevokeProductKey(apiKey)}
                        isDisabled={mutatingProductKeyId === apiKey.id}
                      >
                        <Trash2 className="size-4" />
                        {translate('actions.revoke')}
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
