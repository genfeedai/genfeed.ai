import {
  AGENT_GENERATION_OVERRIDE_CATEGORIES,
  AGENT_REVIEW_OVERRIDE_CATEGORIES,
  AGENT_THINKING_OVERRIDE_CATEGORIES,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { EnabledModelOption } from '@props/settings/model-routing.props';

export type { EnabledModelOption } from '@props/settings/model-routing.props';

// Re-exported under this page's existing names; the categories themselves
// are shared with the server-side override validation — see
// packages/contracts/src/constants/agent-policy-override-categories.constant.ts.
export const AGENT_THINKING_MODEL_CATEGORIES =
  AGENT_THINKING_OVERRIDE_CATEGORIES;
export const AGENT_REVIEW_MODEL_CATEGORIES = AGENT_REVIEW_OVERRIDE_CATEGORIES;
export const AGENT_GENERATION_MODEL_CATEGORIES =
  AGENT_GENERATION_OVERRIDE_CATEGORIES;

/**
 * Catalog rows enabled for a policy selector: matches the org allowlist (ids
 * or keys) and the selector's own categories. Shared by the option builder
 * below and by stored-override resolution so a picker and the value it
 * persists always agree on what counts as "enabled for this selector" — a
 * key enabled only for a different category or selector must not resolve.
 */
export function resolveEnabledModelsForCategory<
  T extends Pick<IModel, 'category' | 'id' | 'key'>,
>(
  enabledModelIds: string[],
  models: T[],
  categories: readonly ModelCategory[],
): T[] {
  if (enabledModelIds.length === 0) {
    return [];
  }

  const allowlist = new Set(enabledModelIds);
  const categorySet = new Set(categories);

  return models.filter((model) => {
    const key = model.key?.trim();
    if (!key || !categorySet.has(model.category)) {
      return false;
    }
    return allowlist.has(model.id) || allowlist.has(key);
  });
}

/**
 * Options for agent policy model overrides.
 *
 * Values are catalog keys — the orchestrator stores and calls keys, not row
 * ids. The org allowlist is ids or keys. Unmatched allowlist ids are dropped
 * so CUID rows never appear as the label.
 */
export function resolveEnabledModelOptions(
  enabledModelIds: string[],
  models: Array<Pick<IModel, 'category' | 'id' | 'key' | 'label'>>,
  categories: readonly ModelCategory[],
): EnabledModelOption[] {
  const seenKeys = new Set<string>();
  const options: EnabledModelOption[] = [];

  for (const model of resolveEnabledModelsForCategory(
    enabledModelIds,
    models,
    categories,
  )) {
    const key = model.key?.trim();
    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    options.push({
      label: model.label?.trim() || key,
      value: key,
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * Map a persisted CUID or key onto the catalog key the orchestrator calls.
 *
 * `models` must already be scoped to the selector's category and the org's
 * enabled-model allowlist (see {@link resolveEnabledModelsForCategory}) — a
 * key that only exists for a different selector or category must not
 * resolve here. Returns `''` when the value is empty or has no match in that
 * scoped list, so an unresolved stored value (a stray CUID, a retired or
 * no-longer-enabled key) surfaces as unset instead of leaking through to the
 * picker or being saved back as-is.
 */
export function resolveStoredAgentModelKey(
  value: string | null | undefined,
  models: Array<Pick<IModel, 'id' | 'key'>>,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  const match = models.find(
    (model) => model.id === trimmed || model.key === trimmed,
  );
  return match?.key?.trim() || '';
}

/**
 * The raw stored override value when it does not resolve against the
 * selector's scoped, enabled models — a model removed from the org's
 * allowlist, or a stale CUID. Used to show an "unresolved model" state in
 * the picker instead of silently falling back to Auto, so the value can be
 * preserved on save rather than cleared by an unrelated policy change.
 * `null` when the value is empty or already resolves.
 */
export function getUnresolvedOverrideKey(
  value: string | null | undefined,
  models: Array<Pick<IModel, 'id' | 'key'>>,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return resolveStoredAgentModelKey(trimmed, models) ? null : trimmed;
}
