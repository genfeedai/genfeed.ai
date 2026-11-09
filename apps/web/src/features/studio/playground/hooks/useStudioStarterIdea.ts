'use client';

import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import {
  buildStudioGenerationSetupScope,
  setGenerationSetupField,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { StudioContentReference } from '@/features/studio/playground/utils/studio-content-references';
import { getDefaultGenerationSetupValues } from '@/features/studio/playground/utils/studio-generation-setup-bridge';
import type { StudioAgentPromptSeed } from '@/features/studio/playground/utils/studio-prompt-author';
import type { StudioPlaygroundStarterSelection } from '@/features/studio/props/studio-playground.props';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioStarterIdeaParams
  extends Pick<
    StudioWorkspaceScope,
    'brandId' | 'setContentReferences' | 'setType'
  > {
  setAgentPromptSeed: Dispatch<SetStateAction<StudioAgentPromptSeed | null>>;
  setContentLibraryRole: Dispatch<
    SetStateAction<StudioPlaygroundReferenceRole>
  >;
  setDocumentSeed: Dispatch<SetStateAction<PromptEditorDocumentSeed | null>>;
  setIsContentLibraryOpen: Dispatch<SetStateAction<boolean>>;
}

/** Applies a starter idea card: its type, setup, seed prompt and reference. */
export function useStudioStarterIdea({
  brandId,
  setAgentPromptSeed,
  setContentLibraryRole,
  setContentReferences,
  setDocumentSeed,
  setIsContentLibraryOpen,
  setType,
}: UseStudioStarterIdeaParams) {
  return useCallback(
    (selection: StudioPlaygroundStarterSelection) => {
      // The editor reports getText() after the seed lands. Setting the prompt
      // here would sync a plain string over the character chip.
      const scope = buildStudioGenerationSetupScope(selection.type);
      const defaults = getDefaultGenerationSetupValues(selection.type);
      if (selection.promptTemplate) {
        setGenerationSetupField(
          scope,
          'promptTemplate',
          selection.promptTemplate,
          defaults,
        );
      }
      if (selection.aspectRatio) {
        setGenerationSetupField(
          scope,
          'aspectRatio',
          selection.aspectRatio,
          defaults,
        );
      }
      if (selection.instrumental !== undefined) {
        setGenerationSetupField(
          scope,
          'instrumental',
          selection.instrumental,
          defaults,
        );
      }
      setType(selection.type);
      setAgentPromptSeed(
        selection.agentPrompt
          ? { text: selection.agentPrompt, type: selection.type }
          : null,
      );
      setDocumentSeed({
        content: selection.content,
        id: selection.seedId,
      });
      if (selection.productReference) {
        const attached = selection.productReference;
        setContentReferences((current) => {
          const next: StudioContentReference = {
            item: {
              brandId: brandId || null,
              contentTitle: attached.label,
              contentType: 'reference',
              id: attached.id,
              thumbnailUrl: attached.previewUrl,
            },
            role: attached.role,
          };
          return [
            ...current.filter((reference) => reference.item.id !== attached.id),
            next,
          ];
        });
      }
      if (selection.openLibraryRole) {
        setContentLibraryRole(selection.openLibraryRole);
        setIsContentLibraryOpen(true);
      }
    },
    [
      brandId,
      setType,
      setContentLibraryRole,
      setIsContentLibraryOpen,
      setDocumentSeed,
      setContentReferences,
      setAgentPromptSeed,
    ],
  );
}
