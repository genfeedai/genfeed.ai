'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { deferredLogger } from '@services/core/deferred-logger';
import { Button } from '@ui/primitives/button';
import { Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from './copy-text';

const COPIED_RESET_MS = 2000;

/**
 * Copies the current URL. The only part of the article header that needs the
 * browser, so the rest of the article renders on the server.
 */
export default function ArticleShareButton(): React.ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timeout);
  }, [isCopied]);

  async function handleShare(): Promise<void> {
    try {
      setIsCopied(await copyText(window.location.href));
    } catch (error) {
      setIsCopied(false);
      deferredLogger.error('Failed to copy to clipboard:', error);
    }
  }

  return (
    <Button
      variant={ButtonVariant.SECONDARY}
      className="border border-foreground/10 bg-foreground/10 text-foreground backdrop-blur-sm transition-all hover:border-foreground/20 hover:bg-foreground/20"
      onClick={handleShare}
    >
      <Share2 className="size-4" />
      {isCopied ? 'Copied!' : 'Share'}
    </Button>
  );
}
