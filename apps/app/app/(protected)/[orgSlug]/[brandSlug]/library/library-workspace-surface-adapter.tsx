'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import IngredientInspectorRail from '@ui/ingredients/inspector/IngredientInspectorRail';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { dispatchOpenContextTab } from '@/lib/workspace/agent-composer-events';

/**
 * Project the library's selected asset into the workspace rail so the grid
 * stays a contact sheet. The grid publishes its single selection into the
 * shared asset selection; this reads it back and renders the one inspector the
 * shell owns, instead of the library growing a second rail beside the agent's.
 */
export default function LibraryWorkspaceSurfaceAdapter() {
  const translate = useTranslations('pages.library.inspector');
  const { brandId, organizationId } = useBrand();
  const { selectedCanonicalAsset, selectedIngredient } = useAssetSelection();
  const inspector = useWorkspaceInspector();
  // The full inspector object flips identity whenever isOpen changes, which
  // would re-fire the open-on-select effect and fight the topbar collapse.
  const setInspectorOpen = inspector?.setIsOpen;
  const previousAssetIdRef = useRef<string | null>(null);

  // Open the rail when the selection *changes* to a new asset. Never re-open
  // because the operator collapsed the rail while an asset is still selected.
  useEffect(() => {
    const nextId = selectedIngredient?.id ?? null;
    const previousId = previousAssetIdRef.current;
    previousAssetIdRef.current = nextId;

    if (!nextId || nextId === previousId || !setInspectorOpen) {
      return;
    }

    setInspectorOpen(true);
    dispatchOpenContextTab();
  }, [selectedIngredient?.id, setInspectorOpen]);

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

  const inspectorNode = useMemo(
    () => (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        data-testid="library-surface-inspector"
      >
        {selectedIngredient ? (
          <IngredientInspectorRail ingredient={selectedIngredient} />
        ) : (
          <p className="px-4 py-6 text-sm text-foreground/55">
            {translate('empty')}
          </p>
        )}
      </div>
    ),
    [selectedIngredient, translate],
  );

  const renderInspector = useCallback(() => inspectorNode, [inspectorNode]);

  const contextLabel = selectedIngredient
    ? `${translate('surface')} · ${assetLabel}`
    : translate('surface');

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel,
      references,
      renderInspector,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'library',
    }),
    [brandId, contextLabel, organizationId, references, renderInspector],
  );

  // The shell resolves the Context pane through either registration path —
  // keep both so the library never falls through to an empty rail.
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel,
      inspector: inspectorNode,
      surfaceKey: 'library',
    }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);
  return null;
}
