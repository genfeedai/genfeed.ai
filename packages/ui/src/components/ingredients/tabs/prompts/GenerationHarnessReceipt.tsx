'use client';

import type { GenerationHarnessReceiptProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import Card from '@ui/card/Card';
import KnowledgeReceiptList from '@ui/knowledge/KnowledgeReceiptList';
import { useTranslations } from 'next-intl';

export default function GenerationHarnessReceipt({
  receipt,
}: GenerationHarnessReceiptProps) {
  const translate = useTranslations('ui.generationHarness');
  return (
    <Card bodyClassName="gap-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {receipt.status === 'applied'
            ? translate('promptEnhanced')
            : translate('enhancementSkipped')}
        </p>
        <p className="text-xs text-muted-foreground">
          {receipt.source === 'request'
            ? translate('requestOverride')
            : receipt.source === 'default'
              ? translate('systemDefault')
              : translate('sourcePreference', { source: receipt.source })}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {translate('submittedPrompt')}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">
          {receipt.enhancedPrompt}
        </p>
      </div>
      {receipt.appliedPacks.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {translate('appliedContext')}
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
      {receipt.knowledgeReceipts?.length ? (
        <KnowledgeReceiptList receipts={receipt.knowledgeReceipts} />
      ) : null}
    </Card>
  );
}
