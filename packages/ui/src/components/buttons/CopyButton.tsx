'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import type { CopyButtonProps } from '@props/ui/buttons/copy-button.props';
import { Button } from '@ui/primitives/button';
import { Check, Copy } from 'lucide-react';
import { useRef, useState } from 'react';

const COPIED_RESET_MS = 2000;

/**
 * The one copy-to-clipboard control: an icon button that writes through
 * `ClipboardService` (Clipboard API, `execCommand` fallback, toast) and shows
 * a check for two seconds after a successful copy. The click does not reach a
 * clickable row or node around it.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = 'Copied',
  className,
  size = ButtonSize.ICON,
  tooltipPosition,
  variant = ButtonVariant.GHOST,
  onCopied,
  onCopyFailed,
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  async function handleCopy(event: React.MouseEvent): Promise<void> {
    event.stopPropagation();
    const text = typeof value === 'function' ? value() : value;
    const didCopy = await ClipboardService.getInstance().copyToClipboard(text);

    clearTimeout(resetTimer.current);
    setIsCopied(didCopy);

    if (!didCopy) {
      onCopyFailed?.();
      return;
    }

    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    onCopied?.();
  }

  const name = isCopied ? copiedLabel : label;
  const iconClass = size === ButtonSize.XS ? 'size-3.5' : 'size-4';

  return (
    <Button
      aria-label={name}
      className={className}
      onClick={handleCopy}
      size={size}
      tooltip={name}
      tooltipPosition={tooltipPosition}
      type="button"
      variant={variant}
    >
      {isCopied ? (
        <Check aria-hidden="true" className={`${iconClass} text-success`} />
      ) : (
        <Copy aria-hidden="true" className={iconClass} />
      )}
    </Button>
  );
}
