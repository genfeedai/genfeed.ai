import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';

/**
 * Shared Auto detection for agent chat model picks.
 * Empty / missing is unresolved (not Auto); only the explicit sentinel is Auto.
 */
export function isAutoAgentModel(value: string | null | undefined): boolean {
  return value?.trim() === AUTO_MODEL_OPTION_VALUE;
}

/**
 * Wire model for chat requests: Auto omits the key so the server resolves
 * via defaultAgentModel pin or registry/brand/subscription fallbacks.
 */
export function toRuntimeAgentModel(
  selectedModel: string | null | undefined,
): string {
  if (isAutoAgentModel(selectedModel)) {
    return '';
  }
  return selectedModel?.trim() ?? '';
}
