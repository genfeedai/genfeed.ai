import { parseGenerationEntry } from '@genfeedai/contracts/interfaces';

export function serializeGenerationEntry(ingredient: Record<string, unknown>) {
  const providerData = ingredient.providerData;
  return parseGenerationEntry(
    providerData &&
      typeof providerData === 'object' &&
      !Array.isArray(providerData)
      ? (providerData as Record<string, unknown>).generationEntry
      : ingredient.generationEntry,
  );
}

/** Voice provider options retain only the public projection of entry metadata. */
export function sanitizeGenerationEntryProviderData(
  record: Record<string, unknown>,
): unknown {
  const value = record.providerData;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { generationEntry, ...rest } = value as Record<string, unknown>;
  const entry = parseGenerationEntry(generationEntry);
  return entry ? { ...rest, generationEntry: entry } : rest;
}
