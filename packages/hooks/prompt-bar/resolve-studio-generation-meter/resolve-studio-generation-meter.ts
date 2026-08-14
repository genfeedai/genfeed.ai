import type {
  ResolveStudioGenerationCostModelsInput,
  ResolveStudioGenerationMeterInput,
  StudioGenerationCostModels,
  StudioGenerationMeter,
} from '@props/prompt-bars/prompt-bar-generation-meter.props';

export function resolveStudioGenerationCostModels(
  input: ResolveStudioGenerationCostModelsInput,
): StudioGenerationCostModels {
  if (input.selectedModels.length > 0) {
    return { isEstimate: false, models: input.selectedModels };
  }

  const byKey = input.defaultModelKey
    ? input.catalog.find((model) => model.key === input.defaultModelKey)
    : undefined;
  if (byKey) {
    return { isEstimate: true, models: [byKey] };
  }

  const flaggedDefault = input.catalog.find((model) => model.isDefault);
  if (flaggedDefault) {
    return { isEstimate: true, models: [flaggedDefault] };
  }

  const first = input.catalog[0];
  return { isEstimate: true, models: first ? [first] : [] };
}

function formatQueuedClause(queuedCount: number): string {
  return `${queuedCount} queued`;
}

function formatQueuedAria(queuedCount: number): string {
  return `${queuedCount} generation${queuedCount === 1 ? '' : 's'} queued`;
}

export function resolveStudioGenerationMeter(
  input: ResolveStudioGenerationMeterInput,
): StudioGenerationMeter | null {
  const credits = Math.max(0, Math.floor(input.credits));
  const queuedCount = Math.max(0, Math.floor(input.queuedCount));

  if (credits <= 0 && queuedCount <= 0) {
    return null;
  }

  const creditLabel = input.isEstimate ? `~${credits} cr` : `${credits} cr`;
  const creditAria = input.isEstimate
    ? `About ${credits} credits`
    : `${credits} credits`;

  if (credits > 0 && queuedCount > 0) {
    return {
      ariaLabel: `${creditAria}. ${formatQueuedAria(queuedCount)}`,
      credits,
      isEstimate: input.isEstimate,
      label: `${creditLabel} · ${formatQueuedClause(queuedCount)}`,
      queuedCount,
    };
  }

  if (queuedCount > 0) {
    return {
      ariaLabel: formatQueuedAria(queuedCount),
      credits,
      isEstimate: input.isEstimate,
      label: formatQueuedClause(queuedCount),
      queuedCount,
    };
  }

  return {
    ariaLabel: creditAria,
    credits,
    isEstimate: input.isEstimate,
    label: creditLabel,
    queuedCount,
  };
}
