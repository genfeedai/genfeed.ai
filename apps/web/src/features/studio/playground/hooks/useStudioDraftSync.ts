'use client';

import { UploadStatus } from '@genfeedai/contracts';
import type {
  AgentStudioHandoffPayload,
  IIngredient,
  IStudioGenerateDraft,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateDraftPayload,
  StudioPlaygroundReferenceRole,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { restoreReferenceMentionOrder } from '@genfeedai/helpers/content/reference-mention.util';
import type { BrandKnowledgeSelection } from '@genfeedai/props/content/knowledge-library.props';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useMemo } from 'react';
import type { useStudioAttachedAssets } from '@/features/studio/playground/hooks/useStudioAttachedAssets';
import { useStudioPlaygroundDraft } from '@/features/studio/playground/hooks/useStudioPlaygroundDraft';
import type { UseStudioPlaygroundSettingsReturn } from '@/features/studio/playground/hooks/useStudioPlaygroundSettings';
import type { useStudioReferenceSources } from '@/features/studio/playground/hooks/useStudioReferenceSources';
import {
  toContentReference,
  toRestoredAttachment,
} from '@/features/studio/playground/utils/studio-content-references';
import {
  sanitizeStudioPlaygroundSettings,
  sanitizeStudioPlaygroundState,
} from '@/features/studio/playground/utils/studio-playground-storage';
import { getStudioReferenceKind } from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioDraftSyncParams
  extends Pick<
    StudioWorkspaceScope,
    | 'attachments'
    | 'brandId'
    | 'contentReferences'
    | 'getIngredientsService'
    | 'knowledgeSelection'
    | 'prompt'
    | 'restoredRolesRef'
    | 'setContentReferences'
    | 'setPendingRestoredUploadIds'
    | 'setPrompt'
    | 'setRestoredAttachments'
    | 'type'
  > {
  attachedReferenceSources: ReturnType<
    typeof useStudioReferenceSources
  >['attachedReferenceSources'];
  handoffPayload: AgentStudioHandoffPayload | null;
  isDraftLoadedRef: MutableRefObject<boolean>;
  isHandoffLoading: boolean;
  isHydrated: boolean;
  referenceOrderRef: ReturnType<
    typeof useStudioReferenceSources
  >['referenceOrderRef'];
  resolveAttachmentRole: ReturnType<
    typeof useStudioAttachedAssets
  >['resolveAttachmentRole'];
  restoreSettings: UseStudioPlaygroundSettingsReturn['restoreSettings'];
  setBrandKnowledgeSelection: Dispatch<SetStateAction<BrandKnowledgeSelection>>;
  settingsByType: UseStudioPlaygroundSettingsReturn['settingsByType'];
}

/**
 * Autosaves the composer as a server-side draft and restores it on load.
 * Restoring looks every asset up first and only then touches the composer, so
 * a failed lookup leaves it untouched for the load retry.
 */
export function useStudioDraftSync({
  attachedReferenceSources,
  attachments,
  brandId,
  contentReferences,
  getIngredientsService,
  handoffPayload,
  isDraftLoadedRef,
  isHandoffLoading,
  isHydrated,
  knowledgeSelection,
  prompt,
  referenceOrderRef,
  resolveAttachmentRole,
  restoreSettings,
  restoredRolesRef,
  setBrandKnowledgeSelection,
  setContentReferences,
  setPendingRestoredUploadIds,
  setPrompt,
  setRestoredAttachments,
  settingsByType,
  type,
}: UseStudioDraftSyncParams) {
  const draftSettingsByType = useMemo(() => {
    const copy = { ...settingsByType };
    for (const key of Object.keys(copy) as StudioPlaygroundType[]) {
      copy[key] = {
        ...copy[key],
        crunControls: sanitizeStudioPlaygroundSettings(key, copy[key])
          .crunControls,
      };
    }
    return copy;
  }, [settingsByType]);

  const draftReferenceOrder = useMemo(
    () =>
      new Map(
        attachedReferenceSources.map((reference, order) => [
          `${reference.role}:${reference.id}`,
          order,
        ]),
      ),
    [attachedReferenceSources],
  );
  const draftPayload = useMemo<StudioGenerateDraftPayload>(
    () => ({
      attachments: attachments.flatMap((attachment: AttachmentItem) =>
        attachment.status === UploadStatus.COMPLETED && attachment.ingredientId
          ? [
              {
                id: attachment.ingredientId,
                role: resolveAttachmentRole(attachment),
                order: draftReferenceOrder.get(
                  `${resolveAttachmentRole(attachment)}:${attachment.ingredientId}`,
                ),
              },
            ]
          : [],
      ),
      knowledgeSelection,
      prompt,
      references: contentReferences.map((reference) => ({
        id: reference.item.id,
        role: reference.role,
        order: draftReferenceOrder.get(
          `${reference.role}:${reference.item.id}`,
        ),
      })),
      settingsByType: draftSettingsByType,
      type,
    }),
    [
      attachments,
      contentReferences,
      knowledgeSelection,
      prompt,
      resolveAttachmentRole,
      draftSettingsByType,
      draftReferenceOrder,
      type,
    ],
  );

  // Everything that can fail (the asset lookup) runs first; the composer
  // is only touched once the whole restoration is known and still wanted,
  // so a failed lookup leaves it untouched for the load retry.
  const restoreDraft = useCallback(
    async (
      draft: IStudioGenerateDraft,
      signal: AbortSignal,
      canApply: () => boolean,
    ) => {
      const referenceIds = [...draft.references, ...draft.attachments].map(
        (reference) => reference.id,
      );
      let assetsById = new Map<string, IIngredient>();
      if (referenceIds.length > 0) {
        const service = await getIngredientsService();
        const assets = await service.findByIds(referenceIds);
        assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      }
      if (signal.aborted || !canApply()) {
        return 0;
      }

      const references = draft.references.flatMap((reference) => {
        const asset = assetsById.get(reference.id);
        return (asset && toContentReference(asset, reference.role)) ?? [];
      });
      const restoredRoles = new Map<string, StudioPlaygroundReferenceRole>();
      const restoredUploads = draft.attachments.flatMap((reference) => {
        const asset = assetsById.get(reference.id);
        const attachment = asset ? toRestoredAttachment(asset) : null;
        if (!attachment) {
          return [];
        }
        restoredRoles.set(attachment.id, reference.role);
        return [attachment];
      });

      referenceOrderRef.current = restoreReferenceMentionOrder([
        ...draft.attachments.flatMap((entry) => {
          const attachment = restoredUploads.find(
            (item) => item.ingredientId === entry.id,
          );
          return attachment
            ? [
                {
                  key: `upload:${attachment.id}`,
                  id: entry.id,
                  kind: attachment.kind,
                  name: attachment.name,
                  role: entry.role,
                  source: 'upload' as const,
                  order: entry.order,
                },
              ]
            : [];
        }),
        ...draft.references.flatMap((entry) => {
          const reference = references.find(
            (item) => item.item.id === entry.id,
          );
          return reference
            ? [
                {
                  key: `library:${entry.role}:${entry.id}`,
                  id: entry.id,
                  kind: getStudioReferenceKind(reference.item.contentType),
                  name: reference.item.contentTitle,
                  role: entry.role,
                  source: 'library' as const,
                  order: entry.order,
                },
              ]
            : [];
        }),
      ]);
      restoreSettings(
        sanitizeStudioPlaygroundState({
          settingsByType: draft.settingsByType,
          type: draft.type,
        }),
      );
      setPrompt(draft.prompt);
      setBrandKnowledgeSelection({
        brandId,
        value: draft.knowledgeSelection,
      });
      restoredRolesRef.current = restoredRoles;
      setPendingRestoredUploadIds(
        restoredUploads.length > 0
          ? restoredUploads.map((attachment) => attachment.id)
          : null,
      );
      setContentReferences(references);
      setRestoredAttachments(restoredUploads);
      return referenceIds.length - references.length - restoredUploads.length;
    },
    [
      brandId,
      getIngredientsService,
      restoreSettings,
      setRestoredAttachments,
      setPendingRestoredUploadIds,
      restoredRolesRef,
      setPrompt,
      setContentReferences,
      setBrandKnowledgeSelection,
      referenceOrderRef,
    ],
  );

  // A Library edit entry waits for the saved draft instead of blocking its
  // restore, so replacing that draft goes through Replace draft / Cancel.
  const { isLoaded: isDraftLoaded, saveStatus: draftSaveStatus } =
    useStudioPlaygroundDraft({
      brandId,
      canRestore: isHydrated && !isHandoffLoading,
      isAutosaveEnabled: true,
      isRestoreBlocked: Boolean(handoffPayload),
      onRestore: restoreDraft,
      payload: draftPayload,
    });
  isDraftLoadedRef.current = isDraftLoaded;
  return { draftSaveStatus, isDraftLoaded };
}
