import type { IIngredient } from '@genfeedai/contracts/interfaces';

export function getStoryboardAssetLabel(
  asset: IIngredient | null | undefined,
): string | undefined {
  if (!asset) return undefined;
  // Hydrated models synthesize metadataLabel from the ID when metadata is absent.
  // Read stored metadata first so a genuine label equal to an ID prefix survives.
  if (asset.metadata && typeof asset.metadata === 'object') {
    return asset.metadata.label?.trim() || undefined;
  }
  const label = asset.metadataLabel?.trim();
  return label && label !== asset.id && label !== asset.id.slice(0, 8)
    ? label
    : undefined;
}
