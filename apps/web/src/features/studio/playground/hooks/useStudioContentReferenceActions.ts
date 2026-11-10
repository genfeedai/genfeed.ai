'use client';

import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import {
  getModelMaxAudioReferences,
  getModelMaxVideoReferences,
  hasAudioReferences,
  hasVideoReferences,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type {
  StudioPlaygroundJob,
  StudioPlaygroundReferenceRole,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo } from 'react';
import { resolveSupportsInterpolation } from '@/features/studio/playground/utils/studio-content-references';
import {
  canUseStudioJobAsReference,
  replaceStudioContentReference,
  studioJobToContentMention,
  studioReferenceRoleForJob,
} from '@/features/studio/playground/utils/studio-playground-asset';
import {
  getStudioReferenceKind,
  resolveStudioUploadReferenceRole,
} from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioPlaygroundComposerProps } from '@/features/studio/props/studio-playground.props';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioContentReferenceActionsParams
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
  contentLibraryRole: StudioPlaygroundReferenceRole;
  editSourceLimit: number;
  setContentLibraryRole: Dispatch<
    SetStateAction<StudioPlaygroundReferenceRole>
  >;
  setIsContentLibraryOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * Attaching Library references and generated results as references: the
 * per-role limits (frames, video, audio, edit sources) are enforced here.
 */
export function useStudioContentReferenceActions({
  attachments,
  clearCrunRestore,
  contentLibraryRole,
  contentReferences,
  editSourceLimit,
  getAttachmentRole,
  models,
  notificationsService,
  removeAttachment,
  setContentLibraryRole,
  setContentReferences,
  setIsContentLibraryOpen,
  settings,
  translate,
  type,
  updateSettings,
}: UseStudioContentReferenceActionsParams) {
  const attachContentReference = useCallback(
    (item: ContentMentionItem, role: StudioPlaygroundReferenceRole) => {
      clearCrunRestore();
      const kind = getStudioReferenceKind(item.contentType);
      if (role === 'audioReference') {
        const count =
          contentReferences.filter(
            (reference) =>
              reference.role === role && reference.item.id !== item.id,
          ).length +
          attachments.filter(
            (attachment) =>
              resolveStudioUploadReferenceRole(
                attachment.kind,
                type,
                getAttachmentRole(attachment),
              ) === role,
          ).length;
        if (
          kind !== 'audio' ||
          type !== 'video' ||
          !hasAudioReferences(settings.modelKey) ||
          count >= getModelMaxAudioReferences(settings.modelKey)
        ) {
          notificationsService.warning(translate('audioReferenceUnsupported'));
          return;
        }
      } else if (kind === 'audio' || !item.thumbnailUrl) {
        return;
      }
      if (role === 'editSource') {
        const count =
          contentReferences.filter(
            (reference) => reference.role === 'editSource',
          ).length +
          attachments.filter(
            (attachment) => getAttachmentRole(attachment) === 'editSource',
          ).length;
        if (
          count >= editSourceLimit &&
          !contentReferences.some(
            (reference) =>
              reference.item.id === item.id && reference.role === 'editSource',
          )
        ) {
          notificationsService.warning(
            `Image editing accepts at most ${editSourceLimit} source images.`,
          );
          return;
        }
      }
      if (role === 'editMask') {
        for (const attachment of attachments)
          if (getAttachmentRole(attachment) === 'editMask')
            removeAttachment(attachment.id);
        setContentReferences((current) => [
          ...current.filter(
            (reference) =>
              reference.role !== 'editMask' && reference.item.id !== item.id,
          ),
          { item, role: 'editMask' },
        ]);
        setIsContentLibraryOpen(false);
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
      if (
        role === 'videoReference' &&
        !contentReferences.some(
          (reference) =>
            reference.item.id === item.id &&
            reference.role === 'videoReference',
        )
      ) {
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
        if (selectedVideoReferences >= maxVideoReferences) {
          notificationsService.warning(
            `The selected model accepts at most ${maxVideoReferences} video references.`,
          );
          return;
        }
      }
      setContentReferences((current) =>
        replaceStudioContentReference(
          current,
          { item, role },
          supportsInterpolation,
        ),
      );
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
      setIsContentLibraryOpen(false);
    },
    [
      attachments,
      clearCrunRestore,
      models,
      contentReferences,
      getAttachmentRole,
      notificationsService,
      editSourceLimit,
      settings.modelKey,
      settings.resolution,
      updateSettings,
      removeAttachment,
      type,
      translate,
      setContentReferences,
      setIsContentLibraryOpen,
    ],
  );

  const handleSelectContentReference = useCallback(
    (item: ContentMentionItem) => {
      attachContentReference(item, contentLibraryRole);
    },
    [attachContentReference, contentLibraryRole],
  );

  const referenceModelConstraints = useMemo(() => {
    const videoControls = models.find(
      (model) => model.key === settings.modelKey && model.provider === 'crun',
    )?.inputControls;
    const isCrunVideo = videoControls?.mediaKind === 'video';
    return {
      isStartFrameSupported:
        !isCrunVideo || videoControls?.videoRules?.referenceMode !== 'none',
      isVideoReferenceSupported:
        !isCrunVideo && hasVideoReferences(settings.modelKey),
    };
  }, [models, settings.modelKey]);

  const canUseGeneratedReference = useCallback(
    (job: StudioPlaygroundJob) =>
      canUseStudioJobAsReference(job, type, referenceModelConstraints),
    [referenceModelConstraints, type],
  );

  const handleUseGeneratedReference = useCallback(
    (job: StudioPlaygroundJob) => {
      const item = studioJobToContentMention(job);
      if (!item) {
        notificationsService.info(translate('referencePreviewMissing'));
        return;
      }
      const role = studioReferenceRoleForJob(job, type);
      if (!role || !canUseGeneratedReference(job)) {
        notificationsService.warning(translate('referenceUnsupported'));
        return;
      }
      attachContentReference(item, role);
    },
    [
      attachContentReference,
      canUseGeneratedReference,
      notificationsService,
      translate,
      type,
    ],
  );
  const handleOpenLibrary = useCallback<
    StudioPlaygroundComposerProps['onOpenLibrary']
  >(
    (role: StudioPlaygroundReferenceRole = 'reference') => {
      setContentLibraryRole(role);
      setIsContentLibraryOpen(true);
    },
    [setIsContentLibraryOpen, setContentLibraryRole],
  );
  return {
    attachContentReference,
    canUseGeneratedReference,
    handleOpenLibrary,
    handleSelectContentReference,
    handleUseGeneratedReference,
  };
}
