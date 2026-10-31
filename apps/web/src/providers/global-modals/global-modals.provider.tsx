'use client';

import { GlobalModalsContext } from '@genfeedai/contexts/providers/global-modals/global-modals.context';
import type {
  GlobalModalsContextValue,
  GlobalModalsProviderProps,
} from '@genfeedai/props/modals/global-modals.props';
import {
  scheduleModalGlobalSideEffectCleanup,
  useRouteModalGlobalSideEffectCleanup,
} from '@ui/utils/modal-global-side-effects';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';
import GlobalModalsRenderer from './GlobalModalsRenderer';
import { useGlobalModalsState } from './useGlobalModalsState';

export function GlobalModalsProvider({
  children,
  renderModal,
}: GlobalModalsProviderProps): ReactNode {
  const state = useGlobalModalsState();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname ?? ''}?${searchParams?.toString() ?? ''}`;

  useRouteModalGlobalSideEffectCleanup(routeKey);

  useEffect(() => {
    if (state.hasOpenGlobalModal) {
      return;
    }

    return scheduleModalGlobalSideEffectCleanup();
  }, [state.hasOpenGlobalModal]);

  // Consumers (every row or card that opens a modal) re-render on a new value,
  // and this provider re-renders on every route and search-param change.
  const contextValue = useMemo<GlobalModalsContextValue>(
    () => ({
      closeBrandCreateModal: state.closeBrandCreateModal,
      closeConfirm: state.closeConfirm,
      closeExport: state.closeExport,
      closeGallery: state.closeGallery,
      closeGenerateIllustration: state.closeGenerateIllustration,
      closeMetadataModal: state.closeMetadataModal,
      closePostRemixModal: state.closePostRemixModal,
      closePostRepurposeModal: state.closePostRepurposeModal,
      closePromptModal: state.closePromptModal,
      closeUpload: state.closeUpload,
      handlePostClose: state.handlePostClose,
      openBrandCreateModal: state.openBrandCreateModal,
      openConfirm: state.openConfirm,
      openExport: state.openExport,
      openGallery: state.openGallery,
      openGenerateIllustration: state.openGenerateIllustration,
      openMetadataModal: state.openMetadataModal,
      openPostBatchModal: state.openPostBatchModal,
      openPostRemixModal: state.openPostRemixModal,
      openPostRepurposeModal: state.openPostRepurposeModal,
      openPromptModal: state.openPromptModal,
      openUpload: state.openUpload,
      publishIngredient: state.publishIngredient,
    }),
    [
      state.closeBrandCreateModal,
      state.closeConfirm,
      state.closeExport,
      state.closeGallery,
      state.closeGenerateIllustration,
      state.closeMetadataModal,
      state.closePostRemixModal,
      state.closePostRepurposeModal,
      state.closePromptModal,
      state.closeUpload,
      state.handlePostClose,
      state.openBrandCreateModal,
      state.openConfirm,
      state.openExport,
      state.openGallery,
      state.openGenerateIllustration,
      state.openMetadataModal,
      state.openPostBatchModal,
      state.openPostRemixModal,
      state.openPostRepurposeModal,
      state.openPromptModal,
      state.openUpload,
      state.publishIngredient,
    ],
  );

  return (
    <GlobalModalsContext.Provider value={contextValue}>
      {children}
      <GlobalModalsRenderer {...state} renderModal={renderModal} />
    </GlobalModalsContext.Provider>
  );
}
