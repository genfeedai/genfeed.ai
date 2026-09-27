import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

const renderNoInspector = () => null;

/**
 * Hands the library's selected asset to the conversation composer as a typed
 * reference. The asset's detail is rendered by the grid itself into the
 * context sidebar, so this registers no inspector content.
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
      renderInspector: renderNoInspector,
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
