'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { normalizeCrunVideoDraft } from '@genfeedai/helpers/crun-video-input.helper';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef } from 'react';
import type { StudioCrunRestoreStatus } from '@/features/studio/playground/hooks/useStudioCrunRestore';
import { buildRepromptData } from '@/features/studio/playground/utils/generation-payloads';
import {
  EMPTY_ATTACHMENTS,
  type StudioContentReference,
  toContentReference,
  warnForImageEditEntry,
} from '@/features/studio/playground/utils/studio-content-references';
import { imageEditEntryForAsset } from '@/features/studio/playground/utils/studio-image-edit-entry';
import { isStudioImageContinuationSource } from '@/features/studio/playground/utils/studio-playground-asset';
import {
  readStudioCrunRecipeControls,
  readStudioOriginalPrompt,
  recipeFromIngredient,
  recipeFromRepromptData,
  settingsPatchFromRecipe,
  studioIngredientAccessibleLabel,
} from '@/features/studio/playground/utils/studio-playground-recipe';
import { getStudioPlaygroundTypeConfig } from '@/features/studio/playground/utils/studio-playground-types';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioContinuationParams
  extends Pick<
    StudioWorkspaceScope,
    | 'applyTypeSettings'
    | 'attachments'
    | 'brandId'
    | 'clearAttachments'
    | 'clearCrunRestore'
    | 'contentReferences'
    | 'crunRestoreEpochRef'
    | 'crunRestoreScopeRef'
    | 'getIngredientsService'
    | 'isMountedRef'
    | 'knowledgeSelection'
    | 'models'
    | 'notificationsService'
    | 'organizationId'
    | 'prompt'
    | 'promptDocumentRef'
    | 'restoredAttachments'
    | 'restoredRolesRef'
    | 'setContentReferences'
    | 'setPrompt'
    | 'setRestoredAttachments'
    | 'setType'
    | 'settings'
    | 'translate'
    | 'type'
  > {
  setCrunRestoreStatus: Dispatch<SetStateAction<StudioCrunRestoreStatus>>;
  setDocumentSeed: Dispatch<SetStateAction<PromptEditorDocumentSeed | null>>;
}

/**
 * Everything that carries an existing asset or recipe back into the composer
 * (animate, vary, edit, remix). A non-empty composer asks before it is
 * replaced; `isDraftLoadedRef` holds that confirmation back until the saved
 * draft is known.
 */
export function useStudioContinuation({
  applyTypeSettings,
  attachments,
  brandId,
  clearAttachments,
  clearCrunRestore,
  contentReferences,
  crunRestoreEpochRef,
  crunRestoreScopeRef,
  getIngredientsService,
  isMountedRef,
  knowledgeSelection,
  models,
  notificationsService,
  organizationId,
  prompt,
  promptDocumentRef,
  restoredAttachments,
  restoredRolesRef,
  setContentReferences,
  setCrunRestoreStatus,
  setDocumentSeed,
  setPrompt,
  setRestoredAttachments,
  setType,
  settings,
  translate,
  type,
}: UseStudioContinuationParams) {
  const { openConfirm } = useConfirmModal();
  const continuationDraft = JSON.stringify([
    prompt,
    type,
    settings,
    contentReferences,
    attachments.map((attachment) => attachment.id),
    restoredAttachments,
    knowledgeSelection,
  ]);
  const continuationDraftRef = useRef(continuationDraft);
  continuationDraftRef.current = continuationDraft;
  // Until the saved draft is known an empty composer proves nothing: applying
  // then would skip Replace draft and the restore, and autosave would
  // overwrite the saved draft.
  const isDraftLoadedRef = useRef(false);
  const prepareContinuation = useCallback(
    (apply: () => void) => {
      if (!isDraftLoadedRef.current) {
        notificationsService.info(translate('continuation.draftLoading'));
        return;
      }
      if (
        !prompt.trim() &&
        !contentReferences.length &&
        !attachments.length &&
        !restoredAttachments.length
      ) {
        apply();
        return;
      }
      const scope = crunRestoreScopeRef.current;
      const draft = continuationDraftRef.current;
      openConfirm({
        label: translate('continuation.replaceTitle'),
        message: translate('continuation.replaceMessage'),
        confirmLabel: translate('continuation.replaceDraft'),
        cancelLabel: translate('continuation.cancel'),
        onConfirm: () => {
          if (
            !isMountedRef.current ||
            scope !== crunRestoreScopeRef.current ||
            draft !== continuationDraftRef.current
          )
            return;
          apply();
        },
      });
    },
    [
      attachments.length,
      contentReferences.length,
      notificationsService,
      openConfirm,
      prompt,
      restoredAttachments.length,
      translate,
      isMountedRef.current,
      crunRestoreScopeRef.current,
    ],
  );

  const handleAttachGeneratedReference = useCallback(
    (ingredient: IIngredient, targetType: 'image' | 'video') => {
      if (
        !isStudioImageContinuationSource(ingredient, brandId, organizationId)
      ) {
        notificationsService.info(translate('continuation.sourceUnavailable'));
        return;
      }
      const reference = toContentReference(
        ingredient,
        targetType === 'video' ? 'startFrame' : 'reference',
      );
      if (!reference) {
        notificationsService.info(translate('continuation.sourceUnavailable'));
        return;
      }
      reference.item.contentTitle = translate(
        targetType === 'video'
          ? 'continuation.animateSource'
          : 'continuation.variationSource',
        {
          name: studioIngredientAccessibleLabel(ingredient),
        },
      );
      prepareContinuation(() => {
        clearCrunRestore();
        clearAttachments();
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        restoredRolesRef.current.clear();
        setContentReferences([reference]);
        setPrompt('');
        setType(targetType);
      });
    },
    [
      brandId,
      organizationId,
      clearAttachments,
      clearCrunRestore,
      notificationsService,
      prepareContinuation,
      setType,
      translate,
      setRestoredAttachments,
      setContentReferences,
      restoredRolesRef.current.clear,
      setPrompt,
    ],
  );
  const handleEditJob = useCallback(
    (job: StudioPlaygroundJob) => {
      const ingredient = job.ingredient;
      if (
        !isStudioImageContinuationSource(ingredient, brandId, organizationId)
      ) {
        notificationsService.info(translate('continuation.sourceUnavailable'));
        return;
      }
      const reference = toContentReference(ingredient, 'editSource');
      if (!reference) return;
      prepareContinuation(() => {
        clearCrunRestore();
        clearAttachments();
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        restoredRolesRef.current.clear();
        setContentReferences([reference]);
        setPrompt('');
        const entry = imageEditEntryForAsset(
          {
            ...ingredient,
            imageEdit: ingredient.imageEdit ?? job.recipe?.imageEdit,
          },
          {
            height: job.height,
            modelKey: job.modelKey,
            recipeAspectRatio: job.recipe?.aspectRatio,
            recipeModelKey: job.recipe?.modelKey,
            width: job.width,
          },
        );
        applyTypeSettings('image-edit', entry.patch);
        warnForImageEditEntry(
          entry,
          {
            model: (model) => translate('editImage.modelFallback', { model }),
            ratio: (ratio) =>
              translate('editImage.aspectRatioFallback', { ratio }),
          },
          (message) => notificationsService.warning(message),
        );
      });
    },
    [
      clearAttachments,
      clearCrunRestore,
      applyTypeSettings,
      brandId,
      organizationId,
      notificationsService,
      translate,
      prepareContinuation,
      restoredRolesRef.current.clear,
      setContentReferences,
      setPrompt,
      setRestoredAttachments,
    ],
  );
  const applyRecipeContinuation = useCallback(
    (job: StudioPlaygroundJob) => {
      const storedRecipe =
        job.type === 'image-edit' && job.ingredient
          ? recipeFromIngredient(job.ingredient, job.type)
          : job.recipe
            ? job.recipe
            : job.ingredient
              ? recipeFromRepromptData(
                  buildRepromptData(
                    job.ingredient,
                    getStudioPlaygroundTypeConfig(job.type).ingredientCategory,
                    brandId,
                    [...models],
                  ),
                  job.type,
                )
              : null;
      const originalText =
        storedRecipe?.originalText ??
        (job.ingredient ? readStudioOriginalPrompt(job.ingredient) : undefined);
      const recipe = storedRecipe ? { ...storedRecipe, originalText } : null;
      if (originalText === undefined)
        notificationsService.info(
          translate('continuation.originalUnavailable'),
        );

      clearCrunRestore();
      if (!recipe) {
        setType(job.type);
        setPrompt('');
        return;
      }

      if (
        recipe.type === 'video' &&
        recipe.modelKey?.startsWith('crun/') &&
        recipe.crunControls
      ) {
        const epoch = crunRestoreEpochRef.current;
        const scope = crunRestoreScopeRef.current;
        const model = models.find(
          (item) => item.key === recipe.modelKey && item.provider === 'crun',
        );
        const controls = model?.inputControls;
        const residual = readStudioCrunRecipeControls(
          recipe.crunControls,
          'video',
          recipe.modelKey,
        );
        if (controls?.mediaKind !== 'video' || !residual || !brandId) {
          setCrunRestoreStatus('failed');
          notificationsService.warning(translate('crun.videoQuoteStale'));
          return;
        }
        const valid = normalizeCrunVideoDraft(controls, {
          modelKey: residual.modelKey,
          contractVersion: residual.contractVersion,
          prompt: recipe.originalText ?? recipe.text,
          duration: recipe.duration,
          resolution: recipe.resolution,
          aspectRatio: recipe.aspectRatio,
          negativePrompt: residual.negativePrompt,
          guidanceScale: residual.guidanceScale,
          translatePrompt: residual.translatePrompt,
          startFrameId: recipe.references[0],
          endFrameId: recipe.endFrameId,
        }).isValid;
        if (!valid) {
          setCrunRestoreStatus('failed');
          notificationsService.warning(translate('crun.videoQuoteStale'));
          return;
        }
        setCrunRestoreStatus('pending');
        const isCurrent = () =>
          isMountedRef.current &&
          crunRestoreEpochRef.current === epoch &&
          crunRestoreScopeRef.current === scope;
        void (async () => {
          try {
            const ids = [
              ...recipe.references,
              ...(recipe.endFrameId ? [recipe.endFrameId] : []),
            ];
            const service = ids.length ? await getIngredientsService() : null;
            if (!isCurrent()) return;
            const assets = service ? await service.findByIds(ids) : [];
            if (!isCurrent()) return;
            const restored: StudioContentReference[] = [];
            for (const id of ids) {
              const asset = assets.find((item) => item.id === id);
              const reference =
                asset &&
                asset.category === IngredientCategory.IMAGE &&
                !asset.isDeleted &&
                asset.brandId === brandId
                  ? toContentReference(
                      asset,
                      id === recipe.endFrameId ? 'endFrame' : 'startFrame',
                    )
                  : null;
              if (!reference) throw new Error('Unavailable frame');
              restored.push(reference);
            }
            clearAttachments();
            setContentReferences(restored);
            applyTypeSettings('video', {
              ...settingsPatchFromRecipe(recipe),
              aspectRatio:
                recipe.aspectRatio ??
                (typeof controls.fields.aspect_ratio?.default === 'string'
                  ? controls.fields.aspect_ratio.default
                  : ''),
              resolution: recipe.resolution ?? '',
            });
            setPrompt(recipe.originalText ?? '');
            promptDocumentRef.current = null;
            setDocumentSeed(null);
            setCrunRestoreStatus(null);
          } catch {
            if (isCurrent()) {
              setCrunRestoreStatus('failed');
              notificationsService.warning(
                translate('crun.referenceUnavailable'),
              );
            }
          }
        })();
        return;
      }
      if (recipe.type === 'video' && recipe.modelKey?.startsWith('crun/')) {
        clearAttachments();
        setContentReferences([]);
      }
      if (recipe.imageEdit) {
        const edit = recipe.imageEdit;
        const epoch = crunRestoreEpochRef.current;
        const scope = crunRestoreScopeRef.current;
        const isCurrent = () =>
          isMountedRef.current &&
          epoch === crunRestoreEpochRef.current &&
          scope === crunRestoreScopeRef.current;
        clearAttachments();
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        restoredRolesRef.current.clear();
        setContentReferences([]);
        const ids = [...edit.sourceIds, ...(edit.maskId ? [edit.maskId] : [])];
        void getIngredientsService()
          .then(async (service) => {
            if (!isCurrent()) return;
            const ingredients = await service.findByIds(ids);
            if (!isCurrent()) return;
            const byId = new Map(
              ingredients.map((ingredient) => [ingredient.id, ingredient]),
            );
            const references = ids.flatMap((id) => {
              const ingredient = byId.get(id);
              const reference =
                ingredient && ingredient.brandId === brandId
                  ? toContentReference(
                      ingredient,
                      id === edit.maskId ? 'editMask' : 'editSource',
                    )
                  : null;
              return reference ? [reference] : [];
            });
            setContentReferences(
              references.length === ids.length ? references : [],
            );
            if (references.length !== ids.length)
              notificationsService.warning(
                'Some editing sources are unavailable. Choose replacement sources before submitting.',
              );
          })
          .catch(() => {
            if (isCurrent())
              notificationsService.error(
                'Editing sources could not be restored.',
              );
          });
      }
      applyTypeSettings(job.type, settingsPatchFromRecipe(recipe));
      setPrompt(recipe.originalText ?? '');
    },
    [
      applyTypeSettings,
      brandId,
      models,
      setType,
      clearCrunRestore,
      clearAttachments,
      getIngredientsService,
      notificationsService,
      translate,
      restoredRolesRef.current.clear,
      promptDocumentRef,
      setRestoredAttachments,
      crunRestoreScopeRef.current,
      setDocumentSeed,
      isMountedRef.current,
      setPrompt,
      setCrunRestoreStatus,
      setContentReferences,
      crunRestoreEpochRef.current,
    ],
  );

  const handleVaryRecipe = useCallback(
    (job: StudioPlaygroundJob) => {
      prepareContinuation(() => applyRecipeContinuation(job));
    },
    [applyRecipeContinuation, prepareContinuation],
  );
  return {
    handleAttachGeneratedReference,
    handleEditJob,
    handleVaryRecipe,
    isDraftLoadedRef,
    prepareContinuation,
  };
}
