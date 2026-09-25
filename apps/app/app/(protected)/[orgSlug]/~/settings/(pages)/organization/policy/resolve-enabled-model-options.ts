import { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { EnabledModelOption } from '@props/settings/model-routing.props';

export type { EnabledModelOption } from '@props/settings/model-routing.props';

const TEXT_ROUTING_CATEGORIES: readonly ModelCategory[] = [ModelCategory.TEXT];
const MEDIA_ROUTING_CATEGORIES: readonly ModelCategory[] = [
  ModelCategory.IMAGE,
  ModelCategory.IMAGE_EDIT,
  ModelCategory.VIDEO,
  ModelCategory.VIDEO_EDIT,
];

export const AGENT_THINKING_MODEL_CATEGORIES = TEXT_ROUTING_CATEGORIES;
export const AGENT_REVIEW_MODEL_CATEGORIES = TEXT_ROUTING_CATEGORIES;
export const AGENT_GENERATION_MODEL_CATEGORIES = MEDIA_ROUTING_CATEGORIES;

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
  if (enabledModelIds.length === 0) {
    return [];
  }

  const allowlist = new Set(enabledModelIds);
  const categorySet = new Set(categories);
  const seenKeys = new Set<string>();
  const options: EnabledModelOption[] = [];

  for (const model of models) {
    const key = model.key?.trim();
    if (!key || seenKeys.has(key) || !categorySet.has(model.category)) {
      continue;
    }
    if (!allowlist.has(model.id) && !allowlist.has(key)) {
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

/** Map a persisted CUID or key onto the catalog key the orchestrator calls. */
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
  return match?.key?.trim() || trimmed;
}
