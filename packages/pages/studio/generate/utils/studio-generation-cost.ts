import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import {
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type {
  StudioGenerationCostEstimate,
  StudioGenerationCostInput,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import {
  calculateImageGenerationCredits,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
import {
  buildBaseGenerationPayload,
  buildImagePayload,
  buildVideoPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import { buildStudioPromptData } from '@pages/studio/generate/utils/studio-generate-settings';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';

const UNAVAILABLE: StudioGenerationCostEstimate = {
  credits: null,
  status: 'unavailable',
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Only catalog evidence and the shared submission/calculation paths may inform an estimate. */
export function resolveStudioGenerationCost({
  isLoadingModels,
  model,
  settings,
  type,
}: StudioGenerationCostInput): StudioGenerationCostEstimate {
  if (type !== 'image' && type !== 'video') return UNAVAILABLE;
  if (isLoadingModels) return { credits: null, status: 'loading' };
  if (isAutoGenerationModelKey(settings.modelKey))
    return { credits: null, status: 'auto' };
  if (
    !model ||
    model.key !== settings.modelKey ||
    !model.isActive ||
    model.lifecycle === ModelLifecycle.RETIRED ||
    model.category !==
      (type === 'image' ? ModelCategory.IMAGE : ModelCategory.VIDEO) ||
    model.reviewStatus === 'pending' ||
    model.reviewStatus === 'rejected' ||
    model.providerSyncStatus === 'quarantined' ||
    model.providerSyncStatus === 'review_required' ||
    model.providerSyncStatus === 'failed' ||
    model.pendingProviderContractVersion ||
    !Number.isFinite(model.cost) ||
    model.cost < 0 ||
    (model.minCost != null &&
      (!Number.isFinite(model.minCost) || model.minCost < 0)) ||
    (model.costPerUnit != null &&
      (!Number.isFinite(model.costPerUnit) || model.costPerUnit < 0)) ||
    !Number.isInteger(settings.outputs) ||
    settings.outputs < 1
  )
    return UNAVAILABLE;

  // These are the two provider dispatch paths whose fan-out semantics are known here.
  // Special endpoints dispatch before the catalog provider; do not misprice them as Replicate.
  if (
    (model.provider !== ModelProvider.FAL &&
      model.provider !== ModelProvider.REPLICATE) ||
    model.key.toLowerCase().startsWith('genfeed-ai/') ||
    [
      MODEL_KEYS.KLINGAI_V2,
      MODEL_KEYS.HIGGSFIELD_SOUL,
      MODEL_KEYS.LEONARDOAI,
      MODEL_KEYS.SDXL,
    ].includes(model.key)
  )
    return UNAVAILABLE;

  const pricingType = model.pricingType ?? PricingType.FLAT;
  if (
    ![
      PricingType.FLAT,
      PricingType.PER_REQUEST,
      PricingType.PER_MEGAPIXEL,
      ...(type === 'video' ? [PricingType.PER_SECOND] : []),
    ].includes(pricingType)
  )
    return UNAVAILABLE;
  const isMetered =
    pricingType === PricingType.PER_MEGAPIXEL ||
    pricingType === PricingType.PER_SECOND;
  if (
    model.isFree === true &&
    model.cost === 0 &&
    (isMetered ? model.costPerUnit === 0 : (model.costPerUnit ?? 0) === 0) &&
    (model.minCost ?? 0) === 0
  ) {
    return { credits: 0, status: 'estimated' };
  }
  if (
    isMetered
      ? !isPositiveFinite(model.costPerUnit)
      : !isPositiveFinite(model.cost)
  )
    return UNAVAILABLE;

  const promptData = buildStudioPromptData({
    brandId: '',
    promptText: '',
    settings,
    type,
  });
  const basePayload = buildBaseGenerationPayload(promptData, model.key, '');
  // The charging services use the registry capability (false when absent), not the optional catalog flag.
  const isBatchSupported =
    MODEL_OUTPUT_CAPABILITIES[model.key]?.isBatchSupported ?? false;
  let credits: number;
  if (type === 'image') {
    const payload = buildImagePayload(basePayload, promptData);
    credits = calculateImageGenerationCredits({
      ...payload,
      imageProvider: model.provider,
      isBatchSupported,
      modelKey: model.key,
      pricing: model,
    }).credits;
  } else {
    const payload = buildVideoPayload(basePayload, promptData);
    if (
      (pricingType === PricingType.PER_SECOND &&
        !isPositiveFinite(payload.duration)) ||
      !payload.resolution
    )
      return UNAVAILABLE;
    credits = calculateVideoGenerationCredits({
      ...payload,
      isBatchSupported,
      modelKey: model.key,
      pricing: model,
    }).credits;
  }
  return isPositiveFinite(credits)
    ? { credits, status: 'estimated' }
    : UNAVAILABLE;
}
