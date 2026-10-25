import type { AgentCharacterMentionItem } from '@genfeedai/contracts/interfaces';
import type { StudioReferenceMention } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import type { AnyExtension, Editor } from '@tiptap/core';
import type { Ref } from 'react';

export type StudioMentionSuggestion =
  | { kind: 'reference'; reference: StudioReferenceMention }
  | { kind: 'character'; character: AgentCharacterMentionItem };

export interface StudioReferenceMentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface StudioReferenceMentionListProps {
  command: (item: StudioMentionSuggestion) => void;
  items: StudioMentionSuggestion[];
  ref?: Ref<StudioReferenceMentionListHandle>;
}

export interface StudioReferenceMentionOptions {
  getReferences: () => readonly StudioReferenceMention[];
  getCharacters: () => readonly AgentCharacterMentionItem[];
  onCreate?: (editor: Editor) => void;
}

export interface UseStudioReferenceMentionsInput {
  references: readonly StudioReferenceMention[];
  characters: readonly AgentCharacterMentionItem[];
  characterExtensions: readonly AnyExtension[];
}
