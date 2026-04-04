import type { MemberRole } from '@genfeedai/enums';
import type { PromptBarSuggestionItem } from '@ui/prompt-bars/types/prompt-bar-suggestion-item';

export interface SuggestedAction extends Omit<PromptBarSuggestionItem, 'id'> {
  id?: string;
  visibleTo?: MemberRole[];
}
