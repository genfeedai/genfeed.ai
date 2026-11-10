'use client';

import { IngredientCategory } from '@genfeedai/contracts';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { useStudioContinuation } from '@/features/studio/playground/hooks/useStudioContinuation';
import {
  EMPTY_ATTACHMENTS,
  toContentReference,
  warnForImageEditEntry,
} from '@/features/studio/playground/utils/studio-content-references';
import { imageEditEntryForAsset } from '@/features/studio/playground/utils/studio-image-edit-entry';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioEditEntryParams
  extends Pick<
    StudioWorkspaceScope,
    | 'applyTypeSettings'
    | 'brandId'
    | 'clearAttachments'
    | 'clearCrunRestore'
    | 'crunRestoreEpochRef'
    | 'crunRestoreScopeRef'
    | 'getIngredientsService'
    | 'isMountedRef'
    | 'notificationsService'
    | 'restoredRolesRef'
    | 'setContentReferences'
    | 'setPrompt'
    | 'setRestoredAttachments'
    | 'setType'
    | 'translate'
  > {
  isDraftLoaded: boolean;
  isHydrated: boolean;
  prepareContinuation: ReturnType<
    typeof useStudioContinuation
  >['prepareContinuation'];
}

/**
 * A Library "Edit image" entry (`?editImage=<id>`): once the saved draft is
 * known, offers the asset as the edit source, replacing the draft only after
 * the creator confirms. The entry is consumed so a reload restores the draft.
 */
export function useStudioEditEntry({
  applyTypeSettings,
  brandId,
  clearAttachments,
  clearCrunRestore,
  crunRestoreEpochRef,
  crunRestoreScopeRef,
  getIngredientsService,
  isDraftLoaded,
  isHydrated,
  isMountedRef,
  notificationsService,
  prepareContinuation,
  restoredRolesRef,
  setContentReferences,
  setPrompt,
  setRestoredAttachments,
  setType,
  translate,
}: UseStudioEditEntryParams): void {
  const editSourceQueryId = useSearchParams().get('editImage');
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const prepareContinuationRef = useRef(prepareContinuation);
  prepareContinuationRef.current = prepareContinuation;
  const editEntryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHydrated || !brandId || !isDraftLoaded) return;
    const sourceId = editSourceQueryId;
    if (!sourceId || editEntryRef.current === `${brandId}:${sourceId}`) return;
    editEntryRef.current = `${brandId}:${sourceId}`;
    const epoch = crunRestoreEpochRef.current;
    const scope = crunRestoreScopeRef.current;
    let cancelled = false;
    let isOffered = false;
    const isCurrent = () =>
      !cancelled &&
      isMountedRef.current &&
      epoch === crunRestoreEpochRef.current &&
      scope === crunRestoreScopeRef.current;
    void getIngredientsService()
      .then(async (service) => {
        if (!isCurrent()) return;
        const [ingredient] = await service.findByIds([sourceId]);
        if (!isCurrent()) return;
        if (
          !ingredient ||
          ingredient.id !== sourceId ||
          ingredient.brandId !== brandId ||
          ingredient.isDeleted ||
          ingredient.category !== IngredientCategory.IMAGE
        )
          throw new Error('Editing source not found in this brand.');
        const reference = toContentReference(ingredient, 'editSource');
        if (!reference) throw new Error('Editing source has no preview.');
        // The entry is consumed once offered: a reload restores whichever
        // draft the creator kept instead of asking again.
        const url = new URL(window.location.href);
        url.searchParams.delete('editImage');
        window.history.replaceState(null, '', url);
        isOffered = true;
        prepareContinuationRef.current(() => {
          clearCrunRestore();
          clearAttachments();
          setRestoredAttachments(EMPTY_ATTACHMENTS);
          restoredRolesRef.current.clear();
          setContentReferences([reference]);
          setType('image-edit');
          setPrompt('');
          const entry = imageEditEntryForAsset(ingredient);
          applyTypeSettings('image-edit', entry.patch);
          warnForImageEditEntry(
            entry,
            {
              model: (model) =>
                translateRef.current('editImage.modelFallback', { model }),
              ratio: (ratio) =>
                translateRef.current('editImage.aspectRatioFallback', {
                  ratio,
                }),
            },
            (message) => notificationsService.warning(message),
          );
        });
      })
      .catch((error: unknown) => {
        if (isCurrent())
          notificationsService.error(
            error instanceof Error
              ? error.message
              : 'Editing source unavailable.',
          );
      });
    return () => {
      cancelled = true;
      // Re-offering after the source is applied would find a non-empty
      // composer and ask "Replace your draft?" about the entry itself.
      if (!isOffered) editEntryRef.current = null;
    };
  }, [
    isHydrated,
    isDraftLoaded,
    brandId,
    editSourceQueryId,
    getIngredientsService,
    clearAttachments,
    clearCrunRestore,
    setType,
    applyTypeSettings,
    notificationsService,
    setRestoredAttachments,
    setContentReferences,
    crunRestoreScopeRef.current,
    setPrompt,
    restoredRolesRef.current.clear,
    isMountedRef.current,
    crunRestoreEpochRef.current,
  ]);
}
