import type { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

export interface CopyButtonProps {
  /** What lands on the clipboard. A function is read at click time, for text that is costly to build. */
  value: string | (() => string);
  /** Accessible name and tooltip before the copy, such as "Copy install command". */
  label: string;
  /** Accessible name and tooltip after a successful copy. */
  copiedLabel?: string;
  className?: string;
  size?: ButtonSize;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  variant?: ButtonVariant;
  /** Runs after the text reached the clipboard. */
  onCopied?: () => void;
  /** Runs when the clipboard write failed. */
  onCopyFailed?: () => void;
}
