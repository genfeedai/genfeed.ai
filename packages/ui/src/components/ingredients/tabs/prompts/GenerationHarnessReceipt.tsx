'use client';

import type { GenerationHarnessReceiptProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import Card from '@ui/card/Card';

export default function GenerationHarnessReceipt({
  receipt,
}: GenerationHarnessReceiptProps) {
  return (
    <Card bodyClassName="gap-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {receipt.status === 'applied'
            ? 'Prompt enhanced'
            : 'Enhancement skipped'}
        </p>
        <p className="text-xs text-muted-foreground">
          {receipt.source === 'request'
            ? 'This generation’s override'
            : `${receipt.source === 'default' ? 'System default' : `${receipt.source} preference`}`}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Submitted prompt
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">
          {receipt.enhancedPrompt}
        </p>
      </div>
      {receipt.appliedPacks.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Applied context
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {receipt.appliedPacks.map((pack) => (
              <li key={`${pack.id}@${pack.version}`}>
                {pack.id} · {pack.version}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
