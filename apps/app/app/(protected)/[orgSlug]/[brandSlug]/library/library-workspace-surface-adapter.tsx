import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import IngredientInspectorRail from '@ui/ingredients/inspector/IngredientInspectorRail';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

/**
 * Renders the library's selected asset into the context sidebar and hands it
 * to the conversation composer as a typed reference. The grid publishes its
 * single selection into the shared asset selection; closing the sidebar
 * clears that selection, which the grid follows back into its own state.
 */
export default function LibraryWorkspaceSurfaceAdapter() {
  const translate = useTranslations('pages.library.inspector');
  const { brandId, organizationId } = useBrand();
  const {
    requestLightbox,
    selectedCanonicalAsset,
    selectedIngredient,
    setSelectedAsset,
  } = useAssetSelection();
  const handleClose = useCallback(() => {
    setSelectedAsset(null);
  }, [setSelectedAsset]);

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

  return (
    <ContextSidebarPanel
      onClose={handleClose}
      selection={
        selectedIngredient
          ? {
              id: selectedIngredient.id,
              kind: 'asset',
              // Only a click or checkbox toggles the grid selection.
              origin: 'user',
              title: selectedIngredient.metadataLabel || translate('untitled'),
            }
          : null
      }
    >
      {selectedIngredient ? (
        <IngredientInspectorRail
          ingredient={selectedIngredient}
          onOpenPreview={() => requestLightbox(selectedIngredient)}
        />
      ) : null}
    </ContextSidebarPanel>
  );
}
