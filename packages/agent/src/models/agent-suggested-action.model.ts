import type { MemberRole } from '@genfeedai/contracts';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';

export interface SuggestedAction extends Omit<PromptBarSuggestionItem, 'id'> {
  id?: string;
  /**
   * Route actions that stay visible (first) even when brand-personalized
   * suggestions replace the rest of the route defaults.
   */
  isPinned?: boolean;
  visibleTo?: MemberRole[];
}
