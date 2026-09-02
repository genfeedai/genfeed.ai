import type { AgentCharacterMentionItem } from '@genfeedai/contracts/interfaces';
import type { CharacterMentionSubmitResult } from '@genfeedai/helpers/content/character-mention.util';
import type { AnyExtension } from '@tiptap/core';
import type { Ref } from 'react';

export type {
  AgentBrandMentionItem as BrandMentionItem,
  AgentCharacterMentionItem as CharacterMentionItem,
  AgentContentMentionItem as ContentMentionItem,
  AgentTeamMentionItem as TeamMentionItem,
} from '@genfeedai/contracts/interfaces';

export interface MentionSuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface CharacterMentionListProps {
  command: (item: AgentCharacterMentionItem) => void;
  items: AgentCharacterMentionItem[];
  ref?: Ref<MentionSuggestionListHandle>;
}

export interface StudioCharacterMentionSubmitInput {
  document: unknown;
  existingReferenceIds: readonly string[];
  text: string;
}

export interface UseStudioCharacterMentionsReturn {
  extraExtensions: readonly AnyExtension[];
  isLoading: boolean;
  mentions: AgentCharacterMentionItem[];
  resolveSubmit: (
    input: StudioCharacterMentionSubmitInput,
  ) => CharacterMentionSubmitResult;
}
