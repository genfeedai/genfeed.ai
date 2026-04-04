import type { ReactNode } from 'react';

export interface PromptBarSuggestionItem {
  id: string;
  label: string;
  prompt: string;
  icon?: ReactNode;
  description?: string;
}
