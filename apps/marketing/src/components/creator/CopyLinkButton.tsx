'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { CopyLinkButtonProps } from '@props/content/creator.props';
import { deferredLogger } from '@services/core/deferred-logger';
import { Button } from '@ui/primitives/button';
import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from './copy-text';

const COPIED_RESET_MS = 2000;

/**
 * Copies the page's canonical URL, never `window.location`: a reader who
 * arrived with tracking parameters or a preview token shares the clean link.
 */
export default function CopyLinkButton({
  className,
  url,
}: CopyLinkButtonProps): React.ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timeout);
  }, [isCopied]);

  async function handleCopy(): Promise<void> {
    try {
      setIsCopied(await copyText(url));
    } catch (error) {
      setIsCopied(false);
      deferredLogger.error('Failed to copy to clipboard:', error);
    }
  }

  return (
    <Button
      className={className}
      variant={ButtonVariant.SECONDARY}
      onClick={handleCopy}
    >
      {isCopied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Link2 className="size-4" aria-hidden="true" />
      )}
      {isCopied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
