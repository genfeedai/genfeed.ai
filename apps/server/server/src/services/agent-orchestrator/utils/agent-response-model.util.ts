/**
 * Pure helpers for resolving/recording which model actually served a turn.
 */

export function buildResolvedModelMetadata(
  requestedModel: string,
  actualModels?: string[],
): {
  actualModel: string;
  actualModels: string[];
  model: string;
  requestedModel: string;
} {
  const normalizedActualModels = Array.from(
    new Set((actualModels ?? []).filter((model) => model.trim().length > 0)),
  );
  const fallbackModel = requestedModel.trim() || requestedModel;
  const actualModel = normalizedActualModels.at(-1) ?? fallbackModel;

  return {
    actualModel,
    actualModels: normalizedActualModels.length
      ? normalizedActualModels
      : [actualModel],
    model: actualModel,
    requestedModel,
  };
}

export function normalizeResponseModel(
  requestedModel: string,
  responseModel?: string,
): string {
  const trimmedRequestedModel = requestedModel.trim();
  const trimmedResponseModel = responseModel?.trim();

  if (!trimmedResponseModel) {
    return trimmedRequestedModel;
  }

  if (
    !trimmedResponseModel.includes('/') &&
    !trimmedRequestedModel.startsWith('openrouter/')
  ) {
    const provider = trimmedRequestedModel.split('/')[0];
    return `${provider}/${trimmedResponseModel}`;
  }

  return trimmedResponseModel;
}
