type TextPricedModel = {
  cost?: number;
  pricingType?: string;
  minCost?: number;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
};

export function extractBillableText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractBillableText(item)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => extractBillableText(item))
      .join(' ');
  }

  return '';
}

export function estimateTextTokens(value: unknown): number {
  const text = extractBillableText(value).trim();

  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function getMinimumTextCredits(model: TextPricedModel): number {
  if (model.pricingType === 'per-token') {
    return 1;
  }

  return model.minCost || model.cost || 0;
}

export function calculateEstimatedTextCredits(
  model: TextPricedModel,
  input: unknown,
  output: string,
): number {
  if (model.pricingType !== 'per-token') {
    return model.cost || 0;
  }

  const inputTokens = estimateTextTokens(input);
  const outputTokens = estimateTextTokens(output);

  return Math.max(
    Math.ceil(
      (inputTokens * (model.inputCostPerMillionTokens || 0) +
        outputTokens * (model.outputCostPerMillionTokens || 0)) /
        1_000_000,
    ),
    getMinimumTextCredits(model),
  );
}
