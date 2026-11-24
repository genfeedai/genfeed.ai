'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { Check, Copy, Terminal } from 'lucide-react';
import { useState } from 'react';

export default function InstallCommand(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    const didCopy = await ClipboardService.getInstance().copyToClipboard(
      'bunx skills add genfeedai/skills',
      { isSilent: true },
    );
    setCopied(didCopy);
    if (didCopy) {
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      textTransform="none"
      onClick={handleCopy}
      className="group inline-flex max-w-full items-center gap-3 px-4 py-3 bg-foreground/5 border border-foreground/10 hover:border-foreground/20 transition-colors font-mono text-xs cursor-pointer sm:px-6 sm:text-sm"
    >
      <Terminal className="size-4 text-foreground/40" />
      <span className="min-w-0 text-foreground/70">
        bunx skills add genfeedai/skills
      </span>
      {copied ? (
        <Check className="size-4 text-success" />
      ) : (
        <Copy className="size-4 text-foreground/40 group-hover:text-foreground/60 transition-colors" />
      )}
    </Button>
  );
}
