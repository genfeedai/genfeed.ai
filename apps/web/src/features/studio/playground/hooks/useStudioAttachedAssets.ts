'use client';

import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import type { MutableRefObject } from 'react';
import { useCallback, useMemo } from 'react';
import type { UseStudioBrandDefaultReferencesReturn } from '@/features/studio/playground/hooks/useStudioBrandDefaultReferences';
import { resolveStudioReferencePreviewUrl } from '@/features/studio/playground/utils/studio-reference-preview';
import {
  getStudioReferenceKind,
  resolveStudioUploadReferenceRole,
} from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioPlaygroundComposerProps } from '@/features/studio/props/studio-playground.props';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioAttachedAssetsParams
  extends Pick<
    StudioWorkspaceScope,
    | 'attachments'
    | 'clearCrunRestore'
    | 'contentReferences'
    | 'getAttachmentRole'
    | 'removeAttachment'
    | 'setContentReferences'
    | 'settings'
    | 'type'
  > {
  /** The brand's default references, shown as chips until the user removes them. */
  brandDefaults: Pick<
    UseStudioBrandDefaultReferencesReturn,
    'assets' | 'dismiss'
  >;
  referencePreviewUrlRef: MutableRefObject<string | undefined>;
}

/** The attachment chips shown in the composer and the preview they imply. */
export function useStudioAttachedAssets({
  attachments,
  brandDefaults,
  clearCrunRestore,
  contentReferences,
  getAttachmentRole,
  referencePreviewUrlRef,
  removeAttachment,
  setContentReferences,
  settings,
  type,
}: UseStudioAttachedAssetsParams) {
  const resolveAttachmentRole = useCallback(
    (attachment: AttachmentItem): StudioPlaygroundReferenceRole =>
      resolveStudioUploadReferenceRole(
        attachment.kind,
        type,
        getAttachmentRole(attachment),
      ),
    [getAttachmentRole, type],
  );

  const attachedAssets = useMemo<PromptBarAttachedAsset[]>(
    () =>
      [
        ...attachments.map((attachment: AttachmentItem) => ({
          id: attachment.id,
          ingredientId: attachment.ingredientId,
          isPrimary: attachment.ingredientId === settings.editPrimaryId,
          kind: attachment.kind,
          name: attachment.name,
          previewUrl: attachment.previewUrl,
          role: resolveAttachmentRole(attachment),
          source: 'upload' as const,
        })),
        ...contentReferences.map((reference) => ({
          id: reference.item.id,
          ingredientId: reference.item.id,
          isPrimary: reference.item.id === settings.editPrimaryId,
          kind: getStudioReferenceKind(reference.item.contentType),
          name: reference.item.contentTitle,
          previewUrl: reference.item.thumbnailUrl,
          role: reference.role,
          source: 'library' as const,
        })),
        ...brandDefaults.assets,
      ].toSorted(
        (left, right) => Number(right.isPrimary) - Number(left.isPrimary),
      ),
    [
      attachments,
      brandDefaults.assets,
      contentReferences,
      resolveAttachmentRole,
      settings.editPrimaryId,
    ],
  );
  referencePreviewUrlRef.current = resolveStudioReferencePreviewUrl({
    assets: attachedAssets,
    avatarPreview: settings.avatarRef?.preview,
    type,
  });

  const dismissBrandDefault = brandDefaults.dismiss;
  const handleRemoveAttachedAsset = useCallback<
    StudioPlaygroundComposerProps['onRemoveAttachedAsset']
  >(
    (assetId) => {
      clearCrunRestore();
      if (dismissBrandDefault(assetId)) return;
      if (
        attachments.some(
          (attachment: AttachmentItem) => attachment.id === assetId,
        )
      ) {
        removeAttachment(assetId);
        return;
      }
      setContentReferences((current) =>
        current.filter((reference) => reference.item.id !== assetId),
      );
    },
    [
      attachments,
      dismissBrandDefault,
      removeAttachment,
      clearCrunRestore,
      setContentReferences,
    ],
  );
  return { attachedAssets, handleRemoveAttachedAsset, resolveAttachmentRole };
}
