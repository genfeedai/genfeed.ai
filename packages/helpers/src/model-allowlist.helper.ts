/**
 * Org generate/chat pickers must honor `enabledModelIds`.
 * Settings → Models stays the unfiltered catalog so operators can enable rows.
 *
 * Empty or missing allowlist = no selectable models (matches RouterService
 * / validateModelForOrg). Self-hosted with no organizationId keeps the catalog.
 */
export function isModelOnOrgAllowlist(
  model: { id?: unknown; key?: unknown },
  enabledModelIds: readonly string[] | null | undefined,
): boolean {
  if (!enabledModelIds || enabledModelIds.length === 0) {
    return false;
  }

  const enabled = new Set(enabledModelIds);
  const modelId = String(model.id ?? '').trim();
  const modelKey = String(model.key ?? '').trim();

  return (
    (modelId.length > 0 && enabled.has(modelId)) ||
    (modelKey.length > 0 && enabled.has(modelKey))
  );
}

export function filterModelsByOrgAllowlist<
  T extends { id?: unknown; key?: unknown },
>(
  models: readonly T[],
  enabledModelIds: readonly string[] | null | undefined,
): T[] {
  if (!enabledModelIds || enabledModelIds.length === 0) {
    return [];
  }

  return models.filter((model) =>
    isModelOnOrgAllowlist(model, enabledModelIds),
  );
}

export function resolveOrgAllowlistedModels<
  T extends { id?: unknown; key?: unknown },
>(
  models: readonly T[],
  options: {
    enabledModelIds?: readonly string[] | null;
    isSettingsReady?: boolean;
    organizationId?: string | null;
  },
): T[] {
  if (!options.organizationId) {
    return [...models];
  }

  if (options.isSettingsReady === false) {
    return [];
  }

  return filterModelsByOrgAllowlist(models, options.enabledModelIds);
}

export function shouldOfferAutoModel(
  allowlistedModels: readonly unknown[],
): boolean {
  return allowlistedModels.length > 0;
}
