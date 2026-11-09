'use client';

import type { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import type { StudioSubmitOptions } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { validateReferenceMentions } from '@genfeedai/helpers/content/reference-mention.util';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { usePromptCommandExtension } from '@/features/studio/components/prompt-editor/use-prompt-command-extension';
import type { useStudioCrunQuote } from '@/features/studio/playground/hooks/useStudioCrunQuote';
import type { StudioCrunRestoreStatus } from '@/features/studio/playground/hooks/useStudioCrunRestore';
import type { UseStudioGenerationReturn } from '@/features/studio/playground/hooks/useStudioGeneration';
import type { useStudioReferenceSources } from '@/features/studio/playground/hooks/useStudioReferenceSources';
import { prepareCrunGenerationIntent } from '@/features/studio/playground/utils/prepare-crun-generation-intent';
import { EMPTY_ATTACHMENTS } from '@/features/studio/playground/utils/studio-content-references';
import {
  resolveStudioPromptAuthor,
  type StudioAgentPromptSeed,
} from '@/features/studio/playground/utils/studio-prompt-author';
import { selectStoppableStudioJobs } from '@/features/studio/playground/utils/studio-stoppable-jobs';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioSubmitParams
  extends Pick<
    StudioWorkspaceScope,
    | 'clearAttachments'
    | 'knowledgeSelection'
    | 'notificationsService'
    | 'prompt'
    | 'promptDocumentRef'
    | 'restoredRolesRef'
    | 'setContentReferences'
    | 'setPrompt'
    | 'setRestoredAttachments'
    | 'type'
  > {
  agentPromptSeed: StudioAgentPromptSeed | null;
  attachedReferenceSources: ReturnType<
    typeof useStudioReferenceSources
  >['attachedReferenceSources'];
  cancelJob: UseStudioGenerationReturn['cancelJob'];
  crunModel: ReturnType<typeof useStudioCrunQuote>['crunModel'];
  crunQuote: ReturnType<typeof useStudioCrunQuote>['crunQuote'];
  crunRequest: ReturnType<typeof useStudioCrunQuote>['crunRequest'];
  crunRestoreStatus: StudioCrunRestoreStatus;
  crunVideoRequest: ReturnType<typeof useStudioCrunQuote>['crunVideoRequest'];
  handoffPayload: AgentStudioHandoffPayload | null;
  hasKnowledgeSelection: boolean;
  isHandoffAccepted: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  jobs: UseStudioGenerationReturn['jobs'];
  latestPromptRef: MutableRefObject<string>;
  referenceMentions: ReturnType<
    typeof useStudioReferenceSources
  >['referenceMentions'];
  resolveCharacterMentions: ReturnType<
    typeof useStudioCharacterMentions
  >['resolveSubmit'];
  resolvePromptCommands: ReturnType<
    typeof usePromptCommandExtension
  >['resolveSubmit'];
  resolvedReferences: ReturnType<
    typeof useStudioReferenceSources
  >['resolvedReferences'];
  setAgentPromptSeed: Dispatch<SetStateAction<StudioAgentPromptSeed | null>>;
  setPendingRestoredUploadIds: Dispatch<SetStateAction<string[] | null>>;
  submit: UseStudioGenerationReturn['submit'];
}

/**
 * Generate and Stop. A submit is guarded against double sends and validated
 * against the prompt's reference mentions; an accepted one clears the
 * composer unless the user already typed the next prompt.
 */
export function useStudioSubmit({
  agentPromptSeed,
  attachedReferenceSources,
  cancelJob,
  clearAttachments,
  crunModel,
  crunQuote,
  crunRequest,
  crunRestoreStatus,
  crunVideoRequest,
  handoffPayload,
  hasKnowledgeSelection,
  isHandoffAccepted,
  isListening,
  isTranscribing,
  isUploading,
  jobs,
  knowledgeSelection,
  latestPromptRef,
  notificationsService,
  prompt,
  promptDocumentRef,
  referenceMentions,
  resolveCharacterMentions,
  resolvePromptCommands,
  resolvedReferences,
  restoredRolesRef,
  setAgentPromptSeed,
  setContentReferences,
  setPendingRestoredUploadIds,
  setPrompt,
  setRestoredAttachments,
  submit,
  type,
}: UseStudioSubmitParams) {
  const referencePreviewUrlRef = useRef<string | undefined>(undefined);
  // Generate submits at once now, so a double click must not send twice.
  const isSubmitInFlightRef = useRef(false);
  // The same in-flight window, as state, so the send button can show it.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stoppableJobs = useMemo(() => selectStoppableStudioJobs(jobs), [jobs]);
  const handleStopGeneration = useCallback(async () => {
    await Promise.all(stoppableJobs.map((job) => cancelJob(job)));
  }, [cancelJob, stoppableJobs]);
  const rejectUnsupportedSkillSelection = useCallback(
    (skillSlugs: string[]) => {
      if (skillSlugs.length && type !== 'image' && type !== 'video') {
        notificationsService.warning(
          'Selected skills are supported for image and video generation. Remove the skill selections to continue here.',
        );
        return true;
      }
      return false;
    },
    [notificationsService.warning, type],
  );
  const handleSubmit = useCallback(
    (submitOptions?: StudioSubmitOptions) => {
      if (crunRestoreStatus || isUploading || isListening || isTranscribing) {
        return;
      }
      if (
        validateReferenceMentions(
          prompt,
          referenceMentions,
          promptDocumentRef.current,
          attachedReferenceSources,
        ).errors.length
      )
        return;
      if (isSubmitInFlightRef.current) return;
      const referencePreviewUrl = referencePreviewUrlRef.current;
      const previewOption = referencePreviewUrl
        ? { referencePreviewUrl }
        : undefined;
      if (type === 'image-edit') {
        const editOptions = { ...previewOption, ...submitOptions };
        isSubmitInFlightRef.current = true;
        setIsSubmitting(true);
        const submission = (
          Object.keys(editOptions).length
            ? submit(prompt, resolvedReferences, editOptions)
            : submit(prompt, resolvedReferences)
        ).finally(() => {
          isSubmitInFlightRef.current = false;
          setIsSubmitting(false);
        });
        const submittedPrompt = prompt;
        void submission.then((accepted) => {
          if (accepted && latestPromptRef.current === submittedPrompt) {
            setPrompt('');
          }
        });
        return;
      }
      // Skills picked from `/` are literal tokens in the prompt. They steer the
      // enhancement pass, never the generator, so they come off first.
      const prepared = prepareCrunGenerationIntent({
        document: promptDocumentRef.current,
        existingReferenceIds: resolvedReferences.imageReferenceIds,
        prompt,
        resolvePromptCommands,
        resolveCharacterMentions,
      });
      const { skillSlugs } = prepared;
      if (rejectUnsupportedSkillSelection(skillSlugs)) return;
      for (const notice of prepared.notices) {
        notificationsService.warning(notice);
      }
      isSubmitInFlightRef.current = true;
      setIsSubmitting(true);
      const submittedPrompt = prompt;
      const promptAuthor = resolveStudioPromptAuthor(
        agentPromptSeed,
        prompt,
        type,
      );
      void submit(
        prepared.text,
        {
          ...resolvedReferences,
          imageReferenceIds: prepared.referenceIds,
        },
        {
          ...(previewOption ?? {}),
          ...submitOptions,
          originalText: prompt,
          ...(promptAuthor ? { promptAuthor } : {}),
          ...(crunModel
            ? {
                ...(crunRequest ? { crunRequest } : {}),
                ...(crunVideoRequest ? { crunVideoRequest } : {}),
                getCurrentCrunQuote: crunQuote.getCurrentQuote,
              }
            : skillSlugs.length ||
                hasKnowledgeSelection ||
                (isHandoffAccepted && handoffPayload?.harness !== undefined)
              ? {
                  ...(skillSlugs.length
                    ? { requestedSkillSlugs: skillSlugs }
                    : {}),
                  ...(hasKnowledgeSelection
                    ? { knowledge: knowledgeSelection }
                    : {}),
                  ...(isHandoffAccepted && handoffPayload?.harness !== undefined
                    ? { harness: handoffPayload.harness }
                    : {}),
                }
              : {}),
        },
      )
        .finally(() => {
          isSubmitInFlightRef.current = false;
          setIsSubmitting(false);
        })
        .then((isAccepted) => {
          // A sent generation leaves an empty composer (and draft) behind; the
          // model settings stay for the next one. Skipped when the user already
          // moved on to the next prompt while this one was being sent.
          if (isAccepted && latestPromptRef.current === submittedPrompt) {
            setPrompt('');
            setAgentPromptSeed(null);
            setContentReferences([]);
            restoredRolesRef.current.clear();
            setPendingRestoredUploadIds(null);
            setRestoredAttachments(EMPTY_ATTACHMENTS);
            clearAttachments();
          }
        });
    },
    [
      agentPromptSeed,
      clearAttachments,
      type,
      isHandoffAccepted,
      handoffPayload,
      crunModel,
      crunRequest,
      crunVideoRequest,
      crunQuote.getCurrentQuote,
      hasKnowledgeSelection,
      knowledgeSelection,
      isListening,
      isTranscribing,
      isUploading,
      crunRestoreStatus,
      notificationsService,
      prompt,
      resolvedReferences,
      referenceMentions,
      attachedReferenceSources,
      resolveCharacterMentions,
      rejectUnsupportedSkillSelection,
      resolvePromptCommands,
      submit,
      setPendingRestoredUploadIds,
      setRestoredAttachments,
      setContentReferences,
      promptDocumentRef.current,
      setPrompt,
      setAgentPromptSeed,
      restoredRolesRef.current.clear,
      latestPromptRef.current,
    ],
  );
  return {
    handleStopGeneration,
    handleSubmit,
    isSubmitting,
    referencePreviewUrlRef,
    stoppableJobs,
  };
}
