/**
 * Org allowlists historically mixed registry ids and model keys.
 * Match either so Auto / settings toggles do not treat a live key list as
 * enable-none and then 403 the routed default (#3227).
 */
export function isModelOnAllowlist(
  model: { id?: unknown; key?: unknown },
  enabledModelIds: readonly string[],
): boolean {
  if (enabledModelIds.length === 0) {
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

export function allowlistHasLiveModel(
  enabledModelIds: readonly string[],
  models: ReadonlyArray<{ id?: unknown; key?: unknown }>,
): boolean {
  return models.some((model) => isModelOnAllowlist(model, enabledModelIds));
}
