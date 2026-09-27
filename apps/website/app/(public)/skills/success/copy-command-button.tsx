'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { CopyCommandButtonProps } from '@props/website/copy-command-button.props';
import { Button } from '@ui/primitives/button';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

const COPIED_RESET_MS = 2000;

/**
 * The only interactive piece of the purchase-complete page, split out so the
 * rest of the page renders on the server.
 */
export default function CopyCommandButton({
  command,
}: CopyCommandButtonProps): React.ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timeout);
  }, [isCopied]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      setIsCopied(true);
    } catch {
      // Clipboard write failed — don't show the success checkmark.
    }
  }

  return (
    <Button
      variant={ButtonVariant.GHOST}
      onClick={handleCopy}
      type="button"
      aria-label="Copy install command"
      title="Copy install command"
      className="shrink-0 p-2 text-surface/55 hover:text-surface transition-colors"
    >
      {isCopied ? (
        <Check className="size-4 text-emerald-400" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}
