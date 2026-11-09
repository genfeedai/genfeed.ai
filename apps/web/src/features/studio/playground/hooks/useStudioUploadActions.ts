'use client';

import {
  getModelMaxAudioReferences,
  getModelMaxVideoReferences,
  hasAudioReferences,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import { resolveSupportsInterpolation } from '@/features/studio/playground/utils/studio-content-references';
import { resolveStudioUploadReferenceRole } from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioPlaygroundComposerProps } from '@/features/studio/props/studio-playground.props';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioUploadActionsParams
  extends Pick<
    StudioWorkspaceScope,
    | 'attachments'
    | 'clearCrunRestore'
    | 'contentReferences'
    | 'getAttachmentRole'
    | 'models'
    | 'notificationsService'
    | 'removeAttachment'
    | 'setContentReferences'
    | 'settings'
    | 'translate'
    | 'type'
    | 'updateSettings'
  > {
  addFiles: (files: File[]) => void;
  editSourceLimit: number;
  uploadRolesRef: MutableRefObject<
    WeakMap<File, StudioPlaygroundReferenceRole>
  >;
}

/** Files dropped, pasted or picked into the composer, filtered per role. */
export function useStudioUploadActions({
  addFiles,
  attachments,
  clearCrunRestore,
  contentReferences,
  editSourceLimit,
  getAttachmentRole,
  models,
  notificationsService,
  removeAttachment,
  setContentReferences,
  settings,
  translate,
  type,
  updateSettings,
  uploadRolesRef,
}: UseStudioUploadActionsParams) {
  return useCallback<StudioPlaygroundComposerProps['onAddFiles']>(
    (files: File[], selectedRole?: StudioPlaygroundReferenceRole) => {
      const role =
        selectedRole ??
        (files.length > 0 &&
        files.every((file) => file.type.startsWith('audio/'))
          ? 'audioReference'
          : 'reference');
      clearCrunRestore();
      if (
        role === 'audioReference' &&
        (type !== 'video' || !hasAudioReferences(settings.modelKey))
      ) {
        notificationsService.warning(translate('audioReferenceUnsupported'));
        return;
      }
      const videoControls = models.find(
        (model) => model.key === settings.modelKey && model.provider === 'crun',
      )?.inputControls;
      const supportsInterpolation = resolveSupportsInterpolation(
        settings.modelKey,
        videoControls,
      );
      const hasStartFrame =
        contentReferences.some(
          (reference) => reference.role === 'startFrame',
        ) ||
        attachments.some(
          (attachment: AttachmentItem) =>
            getAttachmentRole(attachment) === 'startFrame',
        );
      if (role === 'endFrame' && supportsInterpolation && !hasStartFrame) {
        notificationsService.warning(
          'Choose a Start Frame before the End Frame.',
        );
        return;
      }
      if (role === 'endFrame' || role === 'startFrame') {
        setContentReferences((current) =>
          current.filter(
            (reference) =>
              reference.role !== role &&
              (supportsInterpolation ||
                (reference.role !== 'startFrame' &&
                  reference.role !== 'endFrame')),
          ),
        );
        for (const attachment of attachments) {
          const attachmentRole = getAttachmentRole(attachment);
          if (
            attachmentRole === role ||
            (!supportsInterpolation &&
              (attachmentRole === 'startFrame' ||
                attachmentRole === 'endFrame'))
          ) {
            removeAttachment(attachment.id);
          }
        }
      }
      let acceptedFiles = files.filter((file) =>
        role === 'audioReference'
          ? file.type.startsWith('audio/')
          : !file.type.startsWith('audio/'),
      );
      if (role === 'audioReference') {
        const count =
          contentReferences.filter((reference) => reference.role === role)
            .length +
          attachments.filter(
            (attachment) =>
              resolveStudioUploadReferenceRole(
                attachment.kind,
                type,
                getAttachmentRole(attachment),
              ) === role,
          ).length;
        acceptedFiles = acceptedFiles.slice(
          0,
          Math.max(0, getModelMaxAudioReferences(settings.modelKey) - count),
        );
        if (acceptedFiles.length < files.length)
          notificationsService.warning(translate('audioReferenceUnsupported'));
      }
      if (role === 'editSource') {
        const count =
          contentReferences.filter(
            (reference) => reference.role === 'editSource',
          ).length +
          attachments.filter(
            (attachment) => getAttachmentRole(attachment) === 'editSource',
          ).length;
        acceptedFiles = files
          .filter((file) => file.type.startsWith('image/'))
          .slice(0, Math.max(0, editSourceLimit - count));
        if (acceptedFiles.length < files.length)
          notificationsService.warning(
            `Image editing accepts at most ${editSourceLimit} source images.`,
          );
      }
      if (role === 'editMask') {
        acceptedFiles = files
          .filter((file) => file.type.startsWith('image/'))
          .slice(0, 1);
        setContentReferences((current) =>
          current.filter((reference) => reference.role !== 'editMask'),
        );
        for (const attachment of attachments)
          if (getAttachmentRole(attachment) === 'editMask')
            removeAttachment(attachment.id);
      }
      if (role === 'videoReference') {
        const selectedVideoReferences =
          contentReferences.filter(
            (reference) => reference.role === 'videoReference',
          ).length +
          attachments.filter(
            (attachment: AttachmentItem) =>
              getAttachmentRole(attachment) === 'videoReference',
          ).length;
        const maxVideoReferences = getModelMaxVideoReferences(
          settings.modelKey,
        );
        const remaining = Math.max(
          0,
          maxVideoReferences - selectedVideoReferences,
        );
        acceptedFiles = acceptedFiles.slice(0, remaining);
        if (acceptedFiles.length < files.length) {
          notificationsService.warning(
            `The selected model accepts at most ${maxVideoReferences} video references.`,
          );
        }
      }
      for (const file of acceptedFiles) {
        uploadRolesRef.current.set(file, role);
      }
      if (
        role === 'videoReference' &&
        settings.modelKey ===
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
        settings.resolution === '4k'
      ) {
        updateSettings({ resolution: 'pro' });
        notificationsService.warning(
          'Kling Omni video references use Pro quality; 4K is not compatible.',
        );
      }
      if (acceptedFiles.length > 0) {
        addFiles(acceptedFiles);
      }
    },
    [
      addFiles,
      clearCrunRestore,
      models,
      attachments,
      contentReferences,
      getAttachmentRole,
      notificationsService,
      removeAttachment,
      editSourceLimit,
      settings.modelKey,
      settings.resolution,
      updateSettings,
      type,
      translate,
      uploadRolesRef.current.set,
      setContentReferences,
    ],
  );
}
