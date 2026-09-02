import type { MemberRole } from '@genfeedai/contracts';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';

export interface SuggestedAction extends Omit<PromptBarSuggestionItem, 'id'> {
  id?: string;
  visibleTo?: MemberRole[];
}
