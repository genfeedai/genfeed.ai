'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import { LuCheck, LuCopy, LuTerminal } from 'react-icons/lu';

export default function InstallCommand(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText('npx skills add genfeedai/skills');
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
      onClick={handleCopy}
      className="group inline-flex items-center gap-3 px-6 py-3 bg-fill/5 border border-edge/10 hover:border-edge/20 transition-all font-mono text-sm cursor-pointer"
    >
      <LuTerminal className="size-4 text-surface/30" />
      <span className="text-surface/70">npx skills add genfeedai/skills</span>
      {copied ? (
        <LuCheck className="size-4 text-emerald-400" />
      ) : (
        <LuCopy className="size-4 text-surface/30 group-hover:text-surface/60 transition-colors" />
      )}
    </Button>
  );
}
