import type { ReactNode } from 'react';

export interface PromptBarSuggestionItem {
  id: string;
  label: string;
  prompt: string;
  icon?: ReactNode;
  description?: string;
  /**
   * Illustration of what the prompt makes, shown on top of a `cards` tile. A
   * tile that has one drops its icon. Decorative: the label names the tile.
   */
  thumbnailUrl?: string;
}
