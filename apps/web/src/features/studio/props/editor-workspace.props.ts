import type { IngredientFormat } from '@genfeedai/contracts';
import type { LucideIcon } from 'lucide-react';

export type EditorStarterId = 'landscape' | 'portrait' | 'square';

/** One starter for an Editor project. Titles live in i18n by `id`. */
export interface EditorStarter {
  format: IngredientFormat;
  icon: LucideIcon;
  id: EditorStarterId;
}

export interface EditorPromptCardsProps {
  isDisabled?: boolean;
  /** Called with the chosen starter and its translated title. */
  onSelect: (starter: EditorStarter, title: string) => void;
}
