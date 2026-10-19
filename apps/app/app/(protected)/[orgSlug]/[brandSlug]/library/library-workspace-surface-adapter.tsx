import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

/**
 * Hands the library's selected asset to the conversation composer as a typed
 * reference. The grid publishes its single selection into the shared asset
 * selection; `IngredientSidebarPanel` renders that selection in the context
 * sidebar and clears it on close, which the grid follows back into its own
 * state.
 */
export default function LibraryWorkspaceSurfaceAdapter() {
  const translate = useTranslations('pages.library.inspector');
  const { brandId, organizationId } = useBrand();
  const { selectedCanonicalAsset, selectedIngredient } = useAssetSelection();

  const assetLabel =
    selectedIngredient?.metadataLabel ||
    selectedIngredient?.promptText ||
    translate('untitled');

  const references = useMemo(
    () =>
      selectedCanonicalAsset
        ? [
            {
              label: assetLabel,
              reference: selectedCanonicalAsset.reference,
            },
          ]
        : [],
    [assetLabel, selectedCanonicalAsset],
  );

  const contextLabel = selectedIngredient
    ? `${translate('surface')} · ${assetLabel}`
    : translate('surface');

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel,
      references,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'library',
    }),
    [brandId, contextLabel, organizationId, references],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);

  return null;
}
