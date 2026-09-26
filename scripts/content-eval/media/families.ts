/**
 * Model family for media contestants and vision judges. The registry has no
 * family column (`providerSchemaFamily` is a provider-schema shape, not a
 * vendor), and hosts such as Replicate, fal or genfeed-ai front many vendors,
 * so the family is the vendor that trained the model. Unknown keys throw: a
 * cross-family rule that silently passes unknown models is no rule.
 */

const VENDOR_BY_PATTERN: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\/)(openai|gpt-|dall-e|sora)/, 'openai'],
  [/(^|\/)(google|gemini|imagen|veo|nano-banana|gemma)/, 'google'],
  [/(^|\/)(anthropic|claude)/, 'anthropic'],
  [/(^|\/)(x-ai|xai|grok)/, 'xai'],
  [/(^|\/)(black-forest-labs|flux)/, 'black-forest-labs'],
  [/(^|\/)(bytedance|seedream|seedance|seededit)/, 'bytedance'],
  [/(^|\/)(recraft)/, 'recraft-ai'],
  [/(^|\/)(ideogram)/, 'ideogram'],
  [/(^|\/)(kwaivgi|kling)/, 'kuaishou'],
  [/(^|\/)(minimax|hailuo)/, 'minimax'],
  [/(^|\/)(qwen|wan-video|wan-|z-image|alibaba)/, 'qwen'],
  [/(^|\/)(runwayml|runway|gen-4|gen4)/, 'runwayml'],
  [/(^|\/)(pixverse)/, 'pixverse'],
  [/(^|\/)(leonardo)/, 'leonardo-ai'],
  [/(^|\/)(higgsfield)/, 'higgsfield'],
  [/(^|\/)(prunaai|p-video)/, 'prunaai'],
  [/(^|\/)(stability|sdxl|stable-diffusion)/, 'stability-ai'],
  [/(^|\/)(meta-llama|llama)/, 'meta'],
  [/(^|\/)(mistral|pixtral)/, 'mistral'],
  [/(^|\/)(moonshot|kimi)/, 'moonshot'],
  [/(^|\/)(deepseek)/, 'deepseek'],
];

export class UnknownModelFamilyError extends Error {
  constructor(readonly modelKey: string) {
    super(
      `No family mapping for "${modelKey}". Add it to media/families.ts before it can enter a panel.`,
    );
    this.name = 'UnknownModelFamilyError';
  }
}

export function resolveMediaModelFamily(modelKey: string): string {
  const key = modelKey.trim().toLowerCase();
  for (const [pattern, vendor] of VENDOR_BY_PATTERN) {
    if (pattern.test(key)) return vendor;
  }
  throw new UnknownModelFamilyError(modelKey);
}
