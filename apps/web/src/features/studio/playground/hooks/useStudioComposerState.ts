'use client';

import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { BrandKnowledgeSelection } from '@genfeedai/props/content/knowledge-library.props';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { useCallback, useRef, useState } from 'react';
import { countKnowledgeSelection } from '@/features/library/knowledge/components/KnowledgeReferenceSection';
import {
  EMPTY_ATTACHMENTS,
  EMPTY_KNOWLEDGE_SELECTION,
  type StudioContentReference,
} from '@/features/studio/playground/utils/studio-content-references';
import type { StudioAgentPromptSeed } from '@/features/studio/playground/utils/studio-prompt-author';

export interface UseStudioComposerStateParams {
  brandId: string;
}

/**
 * The composer's own state: prompt text, editor seeds, the Library picker,
 * attached Library references, the brand knowledge pick and the uploads
 * restored from a saved draft.
 */
export function useStudioComposerState({
  brandId,
}: UseStudioComposerStateParams) {
  const [prompt, setPrompt] = useState('');
  // Submits overlap, so an accepted one must not wipe what was typed since.
  const latestPromptRef = useRef(prompt);
  latestPromptRef.current = prompt;
  const [documentSeed, setDocumentSeed] =
    useState<PromptEditorDocumentSeed | null>(null);
  const [agentPromptSeed, setAgentPromptSeed] =
    useState<StudioAgentPromptSeed | null>(null);
  const [isContentLibraryOpen, setIsContentLibraryOpen] = useState(false);
  const [contentLibraryRole, setContentLibraryRole] =
    useState<StudioPlaygroundReferenceRole>('reference');
  const [contentReferences, setContentReferences] = useState<
    StudioContentReference[]
  >([]);
  const [brandKnowledgeSelection, setBrandKnowledgeSelection] =
    useState<BrandKnowledgeSelection>({
      brandId: undefined,
      value: EMPTY_KNOWLEDGE_SELECTION,
    });
  // A pick made under another brand is never sent: switching brand returns
  // the Library picker to Auto instead of carrying foreign sources over.
  const knowledgeSelection =
    brandKnowledgeSelection.brandId === brandId
      ? brandKnowledgeSelection.value
      : EMPTY_KNOWLEDGE_SELECTION;
  const hasKnowledgeSelection = countKnowledgeSelection(knowledgeSelection) > 0;
  const handleKnowledgeSelectionChange = useCallback(
    (value: KnowledgeSelection) => {
      setBrandKnowledgeSelection({ brandId, value });
    },
    [brandId],
  );
  const uploadRolesRef = useRef(
    new WeakMap<File, StudioPlaygroundReferenceRole>(),
  );
  // Restored uploads carry no File; their role is keyed by attachment id.
  const restoredRolesRef = useRef(
    new Map<string, StudioPlaygroundReferenceRole>(),
  );
  const [restoredAttachments, setRestoredAttachments] =
    useState<AttachmentItem[]>(EMPTY_ATTACHMENTS);
  // Restored uploads reach `attachments` one render after the Library
  // references; until they do, frame validation would see half a restore.
  const [pendingRestoredUploadIds, setPendingRestoredUploadIds] = useState<
    string[] | null
  >(null);
  const getAttachmentRole = useCallback(
    (attachment: AttachmentItem): StudioPlaygroundReferenceRole | undefined =>
      attachment.file
        ? uploadRolesRef.current.get(attachment.file)
        : restoredRolesRef.current.get(attachment.id),
    [],
  );
  return {
    agentPromptSeed,
    contentLibraryRole,
    contentReferences,
    documentSeed,
    getAttachmentRole,
    handleKnowledgeSelectionChange,
    hasKnowledgeSelection,
    isContentLibraryOpen,
    knowledgeSelection,
    latestPromptRef,
    pendingRestoredUploadIds,
    prompt,
    restoredAttachments,
    restoredRolesRef,
    setAgentPromptSeed,
    setBrandKnowledgeSelection,
    setContentLibraryRole,
    setContentReferences,
    setDocumentSeed,
    setIsContentLibraryOpen,
    setPendingRestoredUploadIds,
    setPrompt,
    setRestoredAttachments,
    uploadRolesRef,
  };
}
