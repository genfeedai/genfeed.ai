'use client';

import type { AgentClientCommandBlock } from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { Code } from '@ui/primitives/code';
import { Pre } from '@ui/primitives/pre';
import { Copy } from 'lucide-react';

export default function CommandBlock({
  label,
  value,
}: AgentClientCommandBlock): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-edge/10 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-edge/10 px-4 py-2">
        <p className="text-xs font-semibold text-surface/75">{label}</p>
        <Button
          ariaLabel={`Copy ${label}`}
          onClick={() => ClipboardService.getInstance().copyToClipboard(value)}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Copy aria-hidden className="mr-2 size-3.5" />
          Copy
        </Button>
      </div>
      <Pre className="max-h-80 overflow-auto bg-background/80 p-5 text-sm leading-6">
        <Code className="whitespace-pre-wrap bg-transparent text-surface/85 [overflow-wrap:anywhere]">
          {value}
        </Code>
      </Pre>
    </div>
  );
}
