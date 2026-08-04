import type { AgentModelOption } from '@genfeedai/agent/constants/agent-models.constant';
import { COMPOSER_GENERATION_AUTO_MODEL_KEY } from '@genfeedai/agent/constants/composer-mode.constant';
import type { GenerationModel } from '@genfeedai/agent/services/agent-api.service';

const GENERATION_AUTO_OPTION: AgentModelOption = {
  brandSlug: 'auto',
  description: 'Router picks a generation model',
  key: COMPOSER_GENERATION_AUTO_MODEL_KEY,
  label: 'Auto',
};

/** Map API generation models into the shared model-selector option shape. */
export function mapGenerationModelsToSelectorOptions(
  models: readonly GenerationModel[],
): AgentModelOption[] {
  return [
    GENERATION_AUTO_OPTION,
    ...models.map((model) => ({
      brandSlug: String(model.provider ?? 'model'),
      costTier: model.costTier,
      description: model.description ?? model.key,
      key: model.key,
      label: model.label || model.key,
    })),
  ];
}

export function resolveGenerationModelSelection(
  selectedKey: string,
): string | null {
  if (!selectedKey || selectedKey === COMPOSER_GENERATION_AUTO_MODEL_KEY) {
    return null;
  }
  return selectedKey;
}

export function toGenerationSelectorSelectedKey(
  generationModelKey: string | null,
): string {
  return generationModelKey && generationModelKey.length > 0
    ? generationModelKey
    : COMPOSER_GENERATION_AUTO_MODEL_KEY;
}
