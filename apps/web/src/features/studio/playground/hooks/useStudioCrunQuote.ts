'use client';

import type { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import { useMemo } from 'react';
import type { usePromptCommandExtension } from '@/features/studio/components/prompt-editor/use-prompt-command-extension';
import type { StudioCrunRestoreStatus } from '@/features/studio/playground/hooks/useStudioCrunRestore';
import type { useStudioReferenceSources } from '@/features/studio/playground/hooks/useStudioReferenceSources';
import {
  buildStudioCrunQuoteRequest,
  buildStudioCrunVideoQuoteRequest,
} from '@/features/studio/playground/utils/generation-payloads';
import { prepareCrunGenerationIntent } from '@/features/studio/playground/utils/prepare-crun-generation-intent';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';
import { useCrunGenerationQuote } from '@/hooks/prompt-bar/use-crun-generation-quote/use-crun-generation-quote';

export interface UseStudioCrunQuoteParams
  extends Pick<
    StudioWorkspaceScope,
    | 'brandId'
    | 'knowledgeSelection'
    | 'models'
    | 'prompt'
    | 'promptDocumentRef'
    | 'settings'
    | 'type'
  > {
  characterMentions: ReturnType<typeof useStudioCharacterMentions>['mentions'];
  crunRestoreStatus: StudioCrunRestoreStatus;
  hasKnowledgeSelection: boolean;
  isUploading: boolean;
  quoteDocumentRevision: number;
  referenceValidation: ReturnType<
    typeof useStudioReferenceSources
  >['referenceValidation'];
  resolveCharacterMentions: ReturnType<
    typeof useStudioCharacterMentions
  >['resolveSubmit'];
  resolvePromptCommands: ReturnType<
    typeof usePromptCommandExtension
  >['resolveSubmit'];
  resolvedReferences: ReturnType<
    typeof useStudioReferenceSources
  >['resolvedReferences'];
}

/**
 * The crun generation intent (prompt with skills and characters resolved),
 * the quote requests built from it and the live quote for the selected model.
 */
export function useStudioCrunQuote({
  brandId,
  characterMentions,
  crunRestoreStatus,
  hasKnowledgeSelection,
  isUploading,
  knowledgeSelection,
  models,
  prompt,
  promptDocumentRef,
  quoteDocumentRevision,
  referenceValidation,
  resolveCharacterMentions,
  resolvePromptCommands,
  resolvedReferences,
  settings,
  type,
}: UseStudioCrunQuoteParams) {
  const crunModel =
    type === 'image' || type === 'video'
      ? models.find(
          (model) =>
            model.key === settings.modelKey && model.provider === 'crun',
        )
      : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: editor document revisions and character catalog changes alter resolver output even when the displayed prompt is unchanged.
  const crunPreparedIntent = useMemo(
    () =>
      crunModel
        ? prepareCrunGenerationIntent({
            document: promptDocumentRef.current,
            existingReferenceIds: resolvedReferences.imageReferenceIds,
            prompt,
            resolvePromptCommands,
            resolveCharacterMentions,
          })
        : {
            text: prompt,
            referenceIds: resolvedReferences.imageReferenceIds,
            notices: [],
            skillSlugs: [],
          },
    [
      crunModel,
      prompt,
      resolvedReferences.imageReferenceIds,
      resolvePromptCommands,
      resolveCharacterMentions,
      quoteDocumentRevision,
      characterMentions,
    ],
  );
  const crunRequest = useMemo(
    () =>
      buildStudioCrunQuoteRequest({
        model: type === 'image' ? crunModel : undefined,
        settings,
        promptText: crunPreparedIntent.text,
        references: crunPreparedIntent.referenceIds,
        brandId,
        requestedSkillSlugs: crunPreparedIntent.skillSlugs,
        ...(hasKnowledgeSelection ? { knowledge: knowledgeSelection } : {}),
        harness: false,
      }),
    [
      crunModel,
      type,
      settings,
      crunPreparedIntent,
      brandId,
      hasKnowledgeSelection,
      knowledgeSelection,
    ],
  );
  const crunVideoRequest = useMemo(() => {
    if (
      type !== 'video' ||
      resolvedReferences.videoReferenceIds.length ||
      resolvedReferences.audioReferenceIds.length
    )
      return null;
    return buildStudioCrunVideoQuoteRequest({
      model: crunModel,
      settings,
      promptText: crunPreparedIntent.text,
      references: crunPreparedIntent.referenceIds,
      endFrameId: resolvedReferences.endFrameId,
      brandId,
      requestedSkillSlugs: crunPreparedIntent.skillSlugs,
      ...(hasKnowledgeSelection ? { knowledge: knowledgeSelection } : {}),
      harness: false,
    });
  }, [
    type,
    crunModel,
    settings,
    crunPreparedIntent,
    resolvedReferences.endFrameId,
    resolvedReferences.videoReferenceIds,
    resolvedReferences.audioReferenceIds,
    brandId,
    hasKnowledgeSelection,
    knowledgeSelection,
  ]);
  const crunQuote = useCrunGenerationQuote(
    type === 'video'
      ? {
          mediaKind: 'video',
          request:
            isUploading ||
            crunRestoreStatus ||
            referenceValidation.errors.length
              ? null
              : crunVideoRequest,
          isActive: Boolean(crunModel),
        }
      : {
          request:
            isUploading ||
            crunRestoreStatus ||
            referenceValidation.errors.length
              ? null
              : crunRequest,
          isActive: Boolean(crunModel),
        },
  );
  return {
    crunModel,
    crunPreparedIntent,
    crunQuote,
    crunRequest,
    crunVideoRequest,
  };
}
