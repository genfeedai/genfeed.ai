import type {
  CanonicalAssetSelection,
  IIngredient,
} from '@genfeedai/interfaces';

interface CanonicalAssetSelectionScope {
  brandId?: string;
  organizationId: string;
}

function resolveEntityId(
  entity: { id: string } | string | null | undefined,
): string | undefined {
  if (typeof entity === 'string') {
    return entity || undefined;
  }

  return entity?.id || undefined;
}

/**
 * Converts the existing Studio/Library ingredient selection into the typed
 * canonical reference understood by agent messages. Ownership fields are hints
 * only; the server authorizes the record against the authenticated scope.
 */
export function createCanonicalAssetSelection(
  asset: IIngredient | null,
  scope: CanonicalAssetSelectionScope,
): CanonicalAssetSelection | null {
  if (!asset?.id || !scope.organizationId) {
    return null;
  }

  const organizationId =
    resolveEntityId(asset.organization) ?? scope.organizationId;
  const brandId = resolveEntityId(asset.brand) ?? scope.brandId;
  const parentId = resolveEntityId(asset.parent);

  return {
    asset,
    reference: {
      ...(brandId ? { brandId } : {}),
      kind: 'ingredient',
      organizationId,
      recordId: asset.id,
      serializer: 'ingredient',
    },
    version: {
      id: asset.id,
      ...(typeof asset.version === 'number' ? { number: asset.version } : {}),
      ...(parentId ? { parentId } : {}),
    },
  };
}
