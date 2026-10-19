'use client';

import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import { ContextSidebarPanel } from '@genfeedai/contexts/ui/context-sidebar-context';
import { createAdminIngredientRoute } from '@genfeedai/contracts/constants';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

// Mounted on every protected page, so the inspector (video player, lineage,
// quick actions) only loads once an ingredient is selected.
const IngredientInspectorRail = dynamic(
  () => import('@ui/ingredients/inspector/IngredientInspectorRail'),
  { ssr: false },
);

const ADMIN_ROUTE_PREFIX = '/admin';
// Only these routes mount an asset list that answers a lightbox request.
const LIGHTBOX_ROUTE_PATTERN =
  /\/library(?:\/|$)|^\/admin\/content\/ingredients/;

/**
 * The selected ingredient in the shell's right context sidebar. Mounted once
 * inside the protected frame: every surface that shows an ingredient (the
 * Library, post rows, activity rows, the admin lists) selects it into the
 * shared asset selection and this panel renders it, so there is no per-page
 * overlay.
 */
export default function IngredientSidebarPanel() {
  const translate = useTranslations('pages.library.inspector');
  const pathname = usePathname() ?? '';
  const { requestLightbox, selectedIngredient, setSelectedAsset } =
    useAssetSelection();

  // A selection belongs to the page it was made on; it must not follow the
  // user to another route.
  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    setSelectedAsset(null);
  }, [pathname, setSelectedAsset]);

  const detailHref =
    selectedIngredient && pathname.startsWith(ADMIN_ROUTE_PREFIX)
      ? createAdminIngredientRoute(
          selectedIngredient.category,
          selectedIngredient.id,
        )
      : undefined;
  const canOpenPreview = LIGHTBOX_ROUTE_PATTERN.test(pathname);

  return (
    <ContextSidebarPanel
      onClose={() => setSelectedAsset(null)}
      selection={
        selectedIngredient
          ? {
              id: selectedIngredient.id,
              kind: 'ingredient',
              // Only a click or checkbox toggles the selection.
              origin: 'user',
              title: selectedIngredient.metadataLabel || translate('untitled'),
            }
          : null
      }
    >
      {selectedIngredient ? (
        <IngredientInspectorRail
          detailHref={detailHref}
          ingredient={selectedIngredient}
          onOpenPreview={
            canOpenPreview
              ? () => requestLightbox(selectedIngredient)
              : undefined
          }
        />
      ) : null}
    </ContextSidebarPanel>
  );
}
