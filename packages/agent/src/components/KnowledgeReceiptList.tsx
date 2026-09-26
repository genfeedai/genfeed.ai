import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const EXCERPT_LENGTH = 160;

/** Keys resolve under `pages.library.knowledge.purpose`. */
const PURPOSE_KEY: Record<KnowledgeSourcePurpose, string> = {
  [KnowledgeSourcePurpose.BRAND_TRUTH]: 'brandTruth',
  [KnowledgeSourcePurpose.INSPIRATION]: 'inspiration',
  [KnowledgeSourcePurpose.RESEARCH]: 'research',
};

interface KnowledgeReceiptListProps {
  receipts: KnowledgeReceipt[];
}

function toExcerpt(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  return flattened.length > EXCERPT_LENGTH
    ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : flattened;
}

/**
 * Receipts for the exact Knowledge source versions that grounded a generated
 * output. One row per source version; the strongest passage is the excerpt.
 */
export function KnowledgeReceiptList({
  receipts,
}: KnowledgeReceiptListProps): ReactElement | null {
  const translate = useTranslations('agent.messageCards');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const byVersion = new Map<string, KnowledgeReceipt>();
  for (const receipt of receipts) {
    const current = byVersion.get(receipt.versionId);
    if (!current || receipt.relevance > current.relevance) {
      byVersion.set(receipt.versionId, receipt);
    }
  }
  if (byVersion.size === 0) {
    return null;
  }

  return (
    <section
      aria-label={translate('knowledgeSources')}
      className="space-y-1.5 border-t border-border/50 pt-2"
      data-testid="knowledge-receipts"
    >
      <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        {translate('knowledgeSources')}
      </p>
      <ul className="space-y-1.5">
        {[...byVersion.values()].map((receipt) => (
          <li key={receipt.versionId} className="text-xs">
            <p className="flex flex-wrap items-baseline gap-x-2 text-foreground">
              {receipt.url ? (
                <a
                  className="font-medium underline-offset-2 hover:underline"
                  href={receipt.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {receipt.title}
                </a>
              ) : (
                <span className="font-medium">{receipt.title}</span>
              )}
              {PURPOSE_KEY[receipt.purpose] ? (
                <span className="text-muted-foreground">
                  {translatePurpose(PURPOSE_KEY[receipt.purpose])}
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {translate('knowledgeVersion', { version: receipt.version })}
              </span>
            </p>
            {receipt.excerpt.trim() ? (
              <p className="mt-0.5 text-muted-foreground">
                {toExcerpt(receipt.excerpt)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
