'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  API_KEY_PERMISSION_GROUPS,
  API_KEY_SCOPE_PRESETS,
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
  readApiKeyAllowedBrandIds,
  resolveApiKeyPermissionLevels,
  resolveApiKeyPermissionScopes,
} from '@genfeedai/contracts/constants';
import type {
  ApiKeyPermissionLevel,
  ApiKeyPermissionLevels,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { isCancelledRequest } from '@services/core/operation-error';
import { ApiKeysService } from '@services/management/api-keys.service';
import Card from '@ui/card/Card';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { SelectField } from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import {
  Clipboard,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuthorizedApiKeysContentProps,
  ProductApiKeyForm,
  ProductPlainKey,
} from '@/features/settings/props/api-keys-content.props';
import { isApiKeyLimitReached } from './api-key-create-error';
import ApiKeyPermissionEditor from './api-key-permission-editor';

// Presets fill the editor: each resource takes the level that covers the
// preset's scopes, and the key gets the scopes of those levels.
const PRODUCT_API_KEY_PRESETS = [
  {
    labelKey: 'presets.mcp',
    levels: resolveApiKeyPermissionLevels(API_KEY_SCOPE_PRESETS.mcp),
  },
  {
    labelKey: 'presets.read',
    levels: resolveApiKeyPermissionLevels(API_KEY_SCOPE_PRESETS.read),
  },
  {
    labelKey: 'presets.content',
    levels: resolveApiKeyPermissionLevels(API_KEY_SCOPE_PRESETS.content),
  },
] as const;

const PERMISSION_RESOURCE_IDS = API_KEY_PERMISSION_GROUPS.flatMap((group) =>
  group.resources.map((resource) => resource.id),
);

const SECONDARY_BUTTON_VARIANT = ButtonVariant.SECONDARY;

function levelsMatch(
  selected: ApiKeyPermissionLevels,
  preset: ApiKeyPermissionLevels,
): boolean {
  return PERMISSION_RESOURCE_IDS.every(
    (id) => (selected[id] ?? 'none') === (preset[id] ?? 'none'),
  );
}

function createInitialProductApiKeyForm(label: string): ProductApiKeyForm {
  return {
    allowedIps: '',
    brandId: '',
    description: '',
    expiresAt: '',
    label,
    permissionLevels: PRODUCT_API_KEY_PRESETS[0].levels,
    rateLimit: '',
  };
}

function formatBrandLabels(
  brandIds: readonly string[],
  brands: readonly { id: string; label: string }[],
): string {
  return brandIds
    .map(
      (brandId) =>
        brands.find((brand) => brand.id === brandId)?.label ?? brandId,
    )
    .join(', ');
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

export default function SettingsApiKeysPage() {
  const { organizationId, isReady } = useBrand();
  const {
    status,
    isRouteConfirmed,
    confirmedOrganizationId,
    confirmedOrganizationSlug,
  } = useRoutedOrganization();
  const { sessionId, userId, orgId } = useAuthIdentity();
  const { orgSlug } = useRouteParams<{ orgSlug: string }>();
  const isKeylessSelfHosted =
    isSelfHostedDeployment() && !isBetterAuthEnabled();
  const isAuthorized =
    isKeylessSelfHosted ||
    (status === 'matched' &&
      isRouteConfirmed &&
      Boolean(confirmedOrganizationId) &&
      orgSlug === confirmedOrganizationSlug &&
      organizationId === confirmedOrganizationId);
  if (!isReady || !organizationId || !isAuthorized) return null;
  const authorizedOrganizationId = isKeylessSelfHosted
    ? organizationId
    : confirmedOrganizationId;
  if (!authorizedOrganizationId) return null;
  return (
    <AuthorizedApiKeysContent
      key={JSON.stringify([
        authorizedOrganizationId,
        sessionId,
        userId,
        orgId,
        isKeylessSelfHosted,
      ])}
      organizationId={authorizedOrganizationId}
      isKeylessSelfHosted={isKeylessSelfHosted}
    />
  );
}

function AuthorizedApiKeysContent({
  organizationId,
  isKeylessSelfHosted,
}: AuthorizedApiKeysContentProps) {
  const translate = useTranslations('common.settings.apiKeys');
  const { brands, isReady } = useBrand();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const defaultKeyName = translate('fields.keyNamePlaceholder');
  const loadErrorMessage = translate('errors.load');

  const [productKeysPage, setProductKeysPage] =
    useState<IPaginatedResponse<ApiKey> | null>(null);
  const productApiKeys = productKeysPage?.items ?? [];
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
    useCallback(
      (token: string) =>
        isKeylessSelfHosted
          ? ApiKeysService.getInstance(token)
          : ApiKeysService.forOrganization(token, organizationId),
      [isKeylessSelfHosted, organizationId],
    ),
  );
  const productKeysFetchIdRef = useRef(0);
  const lifecycleRef = useRef({ active: true, generation: 0 });
  const scopedServicesRef = useRef(new Set<ApiKeysService>());
  const pageControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    lifecycleRef.current.active = true;
    pageControllerRef.current = new AbortController();
    return () => {
      lifecycleRef.current.active = false;
      lifecycleRef.current.generation += 1;
      pageControllerRef.current?.abort();
      if (!isKeylessSelfHosted) {
        for (const service of scopedServicesRef.current)
          service.cancelPendingRequests();
      }
      scopedServicesRef.current.clear();
    };
  }, [isKeylessSelfHosted]);

  const currentOperation = useCallback(() => {
    const generation = lifecycleRef.current.generation;
    return () =>
      lifecycleRef.current.active &&
      lifecycleRef.current.generation === generation;
  }, []);

  const acquireService = useCallback(
    async (isCurrent: () => boolean) => {
      if (!isCurrent()) return null;
      const service = await getApiKeysService();
      if (!isCurrent()) {
        if (!isKeylessSelfHosted) service.cancelPendingRequests();
        return null;
      }
      if (!isKeylessSelfHosted) scopedServicesRef.current.add(service);
      return service;
    },
    [getApiKeysService, isKeylessSelfHosted],
  );

  const selectedScopes = useMemo(
    () => resolveApiKeyPermissionScopes(productForm.permissionLevels),
    [productForm.permissionLevels],
  );

  const fetchProductApiKeys = useCallback(
    async (signal?: AbortSignal) => {
      const isActive = currentOperation();
      if (!isActive()) return;
      const fetchId = productKeysFetchIdRef.current + 1;
      productKeysFetchIdRef.current = fetchId;
      const isCurrentFetch = () =>
        isActive() &&
        productKeysFetchIdRef.current === fetchId &&
        !signal?.aborted;

      if (isCurrentFetch()) {
        setIsProductLoading(true);
        setHasProductKeysLoadError(false);
      }
      try {
        const service = await acquireService(isCurrentFetch);
        if (!service || !isCurrentFetch()) return;
        const apiKeys = await service.findAllPage(
          { limit: ITEMS_PER_PAGE, page: currentPage },
          signal ?? pageControllerRef.current?.signal,
        );

        if (isCurrentFetch()) {
          setProductKeysPage(apiKeys);
          setHasProductKeysLoadError(false);
        }
      } catch (error) {
        if (isCancelledRequest(error)) return;
        if (isCurrentFetch()) {
          logger.error('Failed to fetch Genfeed API keys', error);
          NotificationsService.getInstance().error(loadErrorMessage);
          setProductKeysPage(null);
          setHasProductKeysLoadError(true);
        }
      } finally {
        if (isCurrentFetch()) {
          setIsProductLoading(false);
        }
      }
    },
    [acquireService, currentOperation, currentPage, loadErrorMessage],
  );

  useEffect(() => {
    if (!organizationId || !isReady) {
      setProductKeysPage(null);
      setProductPlainKey(null);
      setHasProductKeysLoadError(false);
      setIsProductLoading(false);
      return;
    }
    const controller = new AbortController();

    setProductKeysPage(null);
    setProductPlainKey(null);
    setHasProductKeysLoadError(false);
    setIsProductLoading(true);
    fetchProductApiKeys(controller.signal);
    return () => controller.abort();
  }, [organizationId, isReady, fetchProductApiKeys]);

  const handleProductFormChange = (
    field: keyof Omit<ProductApiKeyForm, 'permissionLevels'>,
    value: string,
  ) => {
    setProductForm((current) => ({ ...current, [field]: value }));
  };

  const handleLevelChange = (
    resourceId: string,
    level: ApiKeyPermissionLevel,
  ) => {
    setProductForm((current) => ({
      ...current,
      permissionLevels: { ...current.permissionLevels, [resourceId]: level },
    }));
  };

  const handlePresetSelect = (levels: ApiKeyPermissionLevels) => {
    setProductForm((current) =>
      levelsMatch(current.permissionLevels, levels)
        ? current
        : { ...current, permissionLevels: levels },
    );
  };

  const handleCreateProductKey = async () => {
    const isCurrent = currentOperation();
    if (!isCurrent()) return;
    const label = productForm.label.trim() || defaultKeyName;
    if (selectedScopes.length === 0) {
      return;
    }

    setIsCreatingProductKey(true);
    try {
      const service = await acquireService(isCurrent);
      if (!service || !isCurrent()) return;
      const apiKey = await service.createApiKey({
        allowedIps: parseCommaSeparated(productForm.allowedIps),
        description: productForm.description.trim() || undefined,
        expiresAt: parseExpiresAt(productForm.expiresAt),
        label,
        rateLimit: productForm.rateLimit
          ? Number.parseInt(productForm.rateLimit, 10)
          : undefined,
        scopes: selectedScopes,
        ...(productForm.brandId
          ? {
              allowedBrandIds: [productForm.brandId],
              defaultBrandId: productForm.brandId,
            }
          : {}),
      });
      if (!isCurrent()) return;
      const key = getVisibleKey(apiKey);

      if (key) {
        setProductPlainKey({ key, label: apiKey.label ?? label });
      }

      setProductForm(createInitialProductApiKeyForm(defaultKeyName));
      await fetchProductApiKeys();
      if (!isCurrent()) return;
      NotificationsService.getInstance().success(translate('success.created'));
    } catch (error) {
      if (!isCurrent() || isCancelledRequest(error)) return;
      if (isApiKeyLimitReached(error)) {
        NotificationsService.getInstance().error(error.message);
        return;
      }
      logger.error('Failed to create Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.create'));
    } finally {
      if (isCurrent()) setIsCreatingProductKey(false);
    }
  };

  const handleCopyProductKey = async (key: string) => {
    const isCurrent = currentOperation();
    if (!isCurrent()) return;
    try {
      await navigator.clipboard.writeText(key);
      if (!isCurrent()) return;
      NotificationsService.getInstance().success(translate('success.copied'));
    } catch (error) {
      if (!isCurrent() || isCancelledRequest(error)) return;
      logger.error('Failed to copy Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.copy'));
    }
  };

  const handleRotateProductKey = async (apiKey: ApiKey) => {
    const isCurrent = currentOperation();
    if (!isCurrent()) return;
    setMutatingProductKeyId(apiKey.id);
    try {
      const service = await acquireService(isCurrent);
      if (!service || !isCurrent()) return;
      const rotatedKey = await service.rotateApiKey(apiKey.id);
      if (!isCurrent()) return;
      const key = getVisibleKey(rotatedKey);

      if (key) {
        setProductPlainKey({
          key,
          label:
            rotatedKey.label ?? apiKey.label ?? translate('plainKey.rotated'),
        });
      }

      await fetchProductApiKeys();
      if (!isCurrent()) return;
      NotificationsService.getInstance().success(translate('success.rotated'));
    } catch (error) {
      if (!isCurrent() || isCancelledRequest(error)) return;
      logger.error('Failed to rotate Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.rotate'));
    } finally {
      if (isCurrent()) setMutatingProductKeyId(null);
    }
  };

  const handleRevokeProductKey = async (apiKey: ApiKey) => {
    const isCurrent = currentOperation();
    if (!isCurrent()) return;
    setMutatingProductKeyId(apiKey.id);
    try {
      const service = await acquireService(isCurrent);
      if (!service || !isCurrent()) return;
      await service.revokeApiKey(apiKey.id);
      if (!isCurrent()) return;
      await fetchProductApiKeys();
      if (!isCurrent()) return;
      NotificationsService.getInstance().success(translate('success.revoked'));
    } catch (error) {
      if (!isCurrent() || isCancelledRequest(error)) return;
      logger.error('Failed to revoke Genfeed API key', error);
      NotificationsService.getInstance().error(translate('errors.revoke'));
    } finally {
      if (isCurrent()) setMutatingProductKeyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      {isReady ? (
        <Card
          label={translate('card.title')}
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
            {brands.length > 1 ? (
              <div className="md:col-span-2">
                <SelectField
                  label={translate('fields.brandAccess')}
                  name="api-key-brand-access"
                  value={productForm.brandId}
                  onChange={(event) =>
                    handleProductFormChange('brandId', event.target.value)
                  }
                >
                  <option value="">{translate('fields.allBrands')}</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {translate('fields.onlyBrand', { brand: brand.label })}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : null}
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
              <SegmentedControl
                appearance="chip"
                ariaLabel={translate('fields.scopePreset')}
                onValueChange={(labelKey) => {
                  const preset = PRODUCT_API_KEY_PRESETS.find(
                    (entry) => entry.labelKey === labelKey,
                  );
                  if (preset) {
                    handlePresetSelect(preset.levels);
                  }
                }}
                options={PRODUCT_API_KEY_PRESETS.map((preset) => ({
                  label: translate(preset.labelKey),
                  value: preset.labelKey,
                }))}
                size="sm"
                value={
                  PRODUCT_API_KEY_PRESETS.find((preset) =>
                    levelsMatch(productForm.permissionLevels, preset.levels),
                  )?.labelKey
                }
              />
            </div>
            <ApiKeyPermissionEditor
              levels={productForm.permissionLevels}
              onLevelChange={handleLevelChange}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleCreateProductKey}
              isDisabled={isCreatingProductKey || selectedScopes.length === 0}
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
              <Alert
                variant="destructive"
                icon={<TriangleAlert className="size-4" aria-hidden="true" />}
              >
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
                      {readApiKeyAllowedBrandIds(apiKey.metadata) ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          {translate('list.limitedTo', {
                            brands: formatBrandLabels(
                              readApiKeyAllowedBrandIds(apiKey.metadata) ?? [],
                              brands,
                            ),
                          })}
                        </p>
                      ) : null}
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
                <AutoPagination
                  showTotal
                  totalLabel="keys"
                  totals={
                    productKeysPage
                      ? {
                          totalDocs: productKeysPage.total,
                          totalPages: productKeysPage.totalPages,
                        }
                      : EMPTY_PAGE_TOTALS
                  }
                />
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner className="size-6 text-primary" />
        </div>
      )}
    </div>
  );
}
