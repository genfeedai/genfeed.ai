import type { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';

export function readArticleGenerationInput(
  value: unknown,
): GenerateArticlesDto {
  const input = readRecord(value);
  const nested = readRecord(input.dto);
  const source = Object.keys(nested).length > 0 ? nested : input;
  const prompt = requiredString(source.prompt ?? source.topic, 'prompt');
  const length = typeof source.length === 'string' ? source.length : undefined;
  const targetWordCount =
    typeof source.targetWordCount === 'number'
      ? source.targetWordCount
      : length === 'long'
        ? 7_000
        : length === 'short'
          ? 2_500
          : length
            ? 4_000
            : undefined;
  const brandId =
    typeof source.brandId === 'string' ? source.brandId : undefined;
  const keywords = Array.isArray(source.keywords)
    ? source.keywords.filter(
        (keyword): keyword is string => typeof keyword === 'string',
      )
    : undefined;
  const tone = typeof source.tone === 'string' ? source.tone : undefined;
  const normalizedSource = { ...source };
  delete normalizedSource.brandId;
  delete normalizedSource.count;
  delete normalizedSource.keywords;
  delete normalizedSource.prompt;
  delete normalizedSource.targetWordCount;
  delete normalizedSource.tone;

  return {
    ...normalizedSource,
    ...(brandId === undefined ? {} : { brandId }),
    count: typeof source.count === 'number' ? source.count : 1,
    ...(keywords === undefined ? {} : { keywords }),
    prompt,
    ...(targetWordCount === undefined ? {} : { targetWordCount }),
    ...(tone === undefined ? {} : { tone }),
  } as GenerateArticlesDto;
}

export function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required article action input: ${field}`);
  }
  return value.trim();
}
