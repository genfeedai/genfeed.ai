import type { RefObject } from 'react';

/** The Library's tag manager. Opened from the bar's "..." menu, so the caller owns its open state. */
export interface LibraryTagManagerDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Focus returns here when the dialog closes; there is no trigger inside the dialog to return to. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}
