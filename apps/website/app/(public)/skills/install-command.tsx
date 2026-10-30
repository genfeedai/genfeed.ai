'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check, Copy, Terminal } from 'lucide-react';
import { useState } from 'react';

export default function InstallCommand(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText('bunx skills add genfeedai/skills');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed — don't show success checkmark
    }
  }

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      textTransform="none"
      onClick={handleCopy}
      className="group inline-flex max-w-full items-center gap-3 px-4 py-3 bg-foreground/5 border border-foreground/10 hover:border-foreground/20 transition-all font-mono text-xs cursor-pointer sm:px-6 sm:text-sm"
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
