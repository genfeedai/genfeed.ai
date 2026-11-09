'use client';

import type { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import { UploadStatus } from '@genfeedai/contracts';
import type { StudioReferenceMentionSource } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import {
  numberReferenceMentions,
  reconcileReferenceMentionOrder,
  resolveAttachedReferenceSources,
  validateReferenceMentions,
} from '@genfeedai/helpers/content/reference-mention.util';
import { useEffect, useMemo, useRef } from 'react';
import type { usePromptCommandExtension } from '@/features/studio/components/prompt-editor/use-prompt-command-extension';
import { useStudioReferenceMentions } from '@/features/studio/playground/hooks/useStudioReferenceMentions';
import {
  getStudioReferenceKind,
  resolveStudioUploadReferenceRole,
  studioAudioReferenceIds,
} from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioReferenceSourcesParams
  extends Pick<
    StudioWorkspaceScope,
    | 'attachments'
    | 'contentReferences'
    | 'getAttachmentRole'
    | 'getCompletedAttachments'
    | 'pendingRestoredUploadIds'
    | 'prompt'
    | 'promptDocumentRef'
    | 'restoredAttachments'
    | 'settings'
    | 'type'
    | 'updateSettings'
  > {
  characterMentionExtensions: ReturnType<
    typeof useStudioCharacterMentions
  >['extraExtensions'];
  characterMentions: ReturnType<typeof useStudioCharacterMentions>['mentions'];
  promptCommandExtensions: ReturnType<
    typeof usePromptCommandExtension
  >['extraExtensions'];
  quoteDocumentRevision: number;
}

/**
 * Orders the attached references, numbers them for `@` mentions, validates
 * the prompt's mentions against them and resolves each reference into the id
 * list the generation request needs.
 */
export function useStudioReferenceSources({
  attachments,
  characterMentionExtensions,
  characterMentions,
  contentReferences,
  getAttachmentRole,
  getCompletedAttachments,
  pendingRestoredUploadIds,
  prompt,
  promptCommandExtensions,
  promptDocumentRef,
  quoteDocumentRevision,
  restoredAttachments,
  settings,
  type,
  updateSettings,
}: UseStudioReferenceSourcesParams) {
  const referenceOrderRef = useRef<StudioReferenceMentionSource[]>([]);
  const orderedReferenceSources = useMemo(() => {
    const completedAttachments = getCompletedAttachments();
    const completedIds = new Set(
      completedAttachments.map((attachment) => attachment.ingredientId),
    );
    const sourceAttachments = [
      ...attachments,
      ...restoredAttachments.filter(
        (attachment) =>
          pendingRestoredUploadIds?.includes(attachment.id) &&
          !attachments.some((current) => current.id === attachment.id),
      ),
    ];
    const current: StudioReferenceMentionSource[] = [
      ...sourceAttachments.map((attachment) => ({
        key: `upload:${attachment.id}`,
        id:
          attachment.ingredientId &&
          (completedIds.has(attachment.ingredientId) ||
            attachment.status === UploadStatus.COMPLETED)
            ? attachment.ingredientId
            : undefined,
        kind: attachment.kind,
        name: attachment.name,
        previewUrl: attachment.previewUrl,
        role: resolveStudioUploadReferenceRole(
          attachment.kind,
          type,
          getAttachmentRole(attachment),
        ),
        source: 'upload' as const,
      })),
      ...completedAttachments
        .filter(
          (completed) =>
            !sourceAttachments.some(
              (attachment) =>
                attachment.ingredientId === completed.ingredientId,
            ),
        )
        .map((completed) => ({
          key: `upload:${completed.ingredientId}`,
          id: completed.ingredientId,
          kind: completed.kind,
          name: completed.ingredientId,
          previewUrl: completed.url,
          role: resolveStudioUploadReferenceRole(completed.kind, type),
          source: 'upload' as const,
        })),
      ...contentReferences.map((reference) => ({
        key: `library:${reference.role}:${reference.item.id}`,
        id: reference.item.id,
        kind: getStudioReferenceKind(reference.item.contentType),
        name: reference.item.contentTitle,
        previewUrl: reference.item.thumbnailUrl,
        role: reference.role,
        source: 'library' as const,
      })),
    ];
    const ordered = reconcileReferenceMentionOrder(
      referenceOrderRef.current,
      current,
    );
    referenceOrderRef.current = ordered;
    return ordered;
  }, [
    attachments,
    contentReferences,
    getAttachmentRole,
    getCompletedAttachments,
    type,
    restoredAttachments,
    pendingRestoredUploadIds,
  ]);
  const attachedReferenceSources = useMemo(
    () => resolveAttachedReferenceSources(orderedReferenceSources),
    [orderedReferenceSources],
  );
  const referenceMentions = useMemo(
    () => numberReferenceMentions(attachedReferenceSources),
    [attachedReferenceSources],
  );
  const referenceExtensions = useStudioReferenceMentions({
    references: referenceMentions,
    characters: type === 'image-edit' ? [] : characterMentions,
    characterExtensions: characterMentionExtensions,
  });
  const composerExtensions = useMemo(
    () => [...referenceExtensions, ...promptCommandExtensions],
    [referenceExtensions, promptCommandExtensions],
  );
  // Document revision catches identity changes even if the plain token is unchanged.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor document is held in a ref to avoid a render on every selection update.
  const referenceValidation = useMemo(
    () =>
      validateReferenceMentions(
        prompt,
        referenceMentions,
        promptDocumentRef.current,
        attachedReferenceSources,
      ),
    [
      prompt,
      referenceMentions,
      attachedReferenceSources,
      quoteDocumentRevision,
    ],
  );

  const resolvedReferences = useMemo(() => {
    const entries = attachedReferenceSources;
    return {
      audioReferenceIds: studioAudioReferenceIds(entries),
      editSourceIds: entries
        .filter((entry) => entry.role === 'editSource')
        .toSorted(
          (left, right) =>
            Number(right.id === settings.editPrimaryId) -
            Number(left.id === settings.editPrimaryId),
        )
        .map((entry) => entry.id),
      editMaskId: entries.find((entry) => entry.role === 'editMask')?.id,
      endFrameId: entries.find((entry) => entry.role === 'endFrame')?.id,
      imageReferenceIds: entries
        .filter(
          (entry) => entry.role === 'reference' || entry.role === 'startFrame',
        )
        .map((entry) => entry.id),
      videoReferenceIds: entries
        .filter((entry) => entry.role === 'videoReference')
        .map((entry) => entry.id),
    };
  }, [attachedReferenceSources, settings.editPrimaryId]);

  useEffect(() => {
    if (type !== 'image-edit' || !resolvedReferences.editSourceIds.length)
      return;
    if (
      !settings.editPrimaryId ||
      !resolvedReferences.editSourceIds.includes(settings.editPrimaryId)
    )
      updateSettings({ editPrimaryId: resolvedReferences.editSourceIds[0] });
  }, [
    type,
    resolvedReferences.editSourceIds,
    settings.editPrimaryId,
    updateSettings,
  ]);
  return {
    attachedReferenceSources,
    composerExtensions,
    referenceMentions,
    referenceOrderRef,
    referenceValidation,
    resolvedReferences,
  };
}
