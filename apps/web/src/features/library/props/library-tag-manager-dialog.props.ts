/** The Library's tag manager. Opened from the bar's "..." menu, so the caller owns its open state. */
export interface LibraryTagManagerDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}
