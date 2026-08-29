import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
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

/**
 * Auto must remain usable at zero balance when the registry exposes its
 * explicitly free route. Concrete user picks stay concrete so the UI can show
 * their real credit requirement instead of silently changing providers.
 */
export function resolveAgentModelForBalance(
  selectedModel: string | null | undefined,
  creditsRemaining: number | null,
  selectableModelKeys: readonly string[],
): string {
  const trimmedSelection = selectedModel?.trim() ?? '';
  const isAutoSelection =
    !trimmedSelection || isAutoAgentModel(trimmedSelection);

  if (
    creditsRemaining === 0 &&
    isAutoSelection &&
    selectableModelKeys.includes(AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE)
  ) {
    return AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE;
  }

  return trimmedSelection;
}
