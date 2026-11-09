'use client';

import {
  hasEndFrame,
  hasVideoReferences,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { isAutoStudioModelKey } from '@genfeedai/pricing';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { useEffect } from 'react';
import { resolveSupportsInterpolation } from '@/features/studio/playground/utils/studio-content-references';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioReferenceSanitizerParams
  extends Pick<
    StudioWorkspaceScope,
    | 'attachments'
    | 'contentReferences'
    | 'getAttachmentRole'
    | 'isLoadingModels'
    | 'models'
    | 'notificationsService'
    | 'pendingRestoredUploadIds'
    | 'removeAttachment'
    | 'setContentReferences'
    | 'setPendingRestoredUploadIds'
    | 'settings'
    | 'type'
  > {}

/**
 * Drops references the selected video model cannot take (end frame, start
 * frame, video references) and settles restored uploads once they attach.
 */
export function useStudioReferenceSanitizer({
  attachments,
  contentReferences,
  getAttachmentRole,
  isLoadingModels,
  models,
  notificationsService,
  pendingRestoredUploadIds,
  removeAttachment,
  setContentReferences,
  setPendingRestoredUploadIds,
  settings,
  type,
}: UseStudioReferenceSanitizerParams): void {
  useEffect(() => {
    if (
      pendingRestoredUploadIds?.every((id) =>
        attachments.some((attachment: AttachmentItem) => attachment.id === id),
      )
    ) {
      setPendingRestoredUploadIds(null);
    }
  }, [attachments, pendingRestoredUploadIds, setPendingRestoredUploadIds]);

  useEffect(() => {
    if (type !== 'video' || pendingRestoredUploadIds) {
      return;
    }
    const selectedCrunModel = models.find(
      (model) => model.key === settings.modelKey && model.provider === 'crun',
    );
    const videoControls = selectedCrunModel?.inputControls;
    if (
      settings.modelKey?.startsWith('crun/') &&
      (isLoadingModels ||
        !selectedCrunModel ||
        videoControls?.mediaKind !== 'video')
    ) {
      return;
    }
    const unsupportedRoles = new Set<StudioPlaygroundReferenceRole>();
    const supportsInterpolation = resolveSupportsInterpolation(
      settings.modelKey,
      videoControls,
    );
    const hasStartFrame =
      contentReferences.some((reference) => reference.role === 'startFrame') ||
      attachments.some(
        (attachment: AttachmentItem) =>
          getAttachmentRole(attachment) === 'startFrame',
      );
    // Auto defers to the router, which picks a model that accepts the frame.
    if (!isAutoStudioModelKey(settings.modelKey)) {
      if (
        !(videoControls?.mediaKind === 'video'
          ? videoControls.videoRules?.referenceMode === 'start-end'
          : hasEndFrame(settings.modelKey))
      ) {
        unsupportedRoles.add('endFrame');
      } else if (supportsInterpolation && !hasStartFrame) {
        unsupportedRoles.add('endFrame');
      } else if (!supportsInterpolation && hasStartFrame) {
        unsupportedRoles.add('endFrame');
      }
    }
    if (
      videoControls?.mediaKind === 'video' ||
      !hasVideoReferences(settings.modelKey)
    ) {
      unsupportedRoles.add('videoReference');
    }
    if (
      videoControls?.mediaKind === 'video' &&
      videoControls.videoRules?.referenceMode === 'none'
    )
      unsupportedRoles.add('startFrame');
    const removedContentCount = contentReferences.filter((reference) =>
      unsupportedRoles.has(reference.role),
    ).length;
    const unsupportedAttachments = attachments.filter(
      (attachment: AttachmentItem) => {
        const role = getAttachmentRole(attachment);
        return role ? unsupportedRoles.has(role) : false;
      },
    );
    if (removedContentCount === 0 && unsupportedAttachments.length === 0) {
      return;
    }
    setContentReferences((current) =>
      current.filter((reference) => !unsupportedRoles.has(reference.role)),
    );
    for (const attachment of unsupportedAttachments) {
      removeAttachment(attachment.id);
    }
    notificationsService.warning(
      !supportsInterpolation &&
        hasStartFrame &&
        unsupportedRoles.has('endFrame')
        ? 'End Frame was cleared because the selected model accepts only one frame.'
        : 'Unsupported frame or video references were cleared for the selected model.',
    );
  }, [
    attachments,
    contentReferences,
    getAttachmentRole,
    notificationsService,
    pendingRestoredUploadIds,
    removeAttachment,
    settings.modelKey,
    models,
    isLoadingModels,
    type,
    setContentReferences,
  ]);
}
