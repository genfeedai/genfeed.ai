import type { KnowledgeCitationListProps } from '@genfeedai/props/content/knowledge-library.props';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const EXCERPT_LENGTH = 160;

function toExcerpt(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  return flattened.length > EXCERPT_LENGTH
    ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : flattened;
}

/**
 * The numbered sources behind an agent answer. Each row matches a `[n]` marker
 * in the text and is the exact Knowledge passage the server verified for the
 * asking user; citations the server could not verify are only counted.
 */
export default function KnowledgeCitationList({
  citations,
}: KnowledgeCitationListProps): ReactElement | null {
  const translate = useTranslations('ui.knowledgeReceipts');
  const rows = [...citations.citations].sort((a, b) => a.marker - b.marker);
  const conflicts = citations.conflicts ?? [];
  if (
    rows.length === 0 &&
    conflicts.length === 0 &&
    citations.unsupportedCount === 0
  ) {
    return null;
  }

  return (
    <section
      aria-label={translate('citationsTitle')}
      className="mt-2 space-y-1.5 border-t border-border/50 pt-2"
      data-testid="knowledge-citations"
    >
      {rows.length > 0 ? (
        <>
          <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {translate('citationsTitle')}
          </p>
          <ol className="space-y-1.5">
            {rows.map(({ marker, receipt }) => (
              <li
                key={marker}
                className="flex gap-2 text-xs"
                data-testid={`knowledge-citation-${marker}`}
              >
                <span className="shrink-0 font-medium text-muted-foreground">
                  [{marker}]
                </span>
                <div className="min-w-0">
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
                    <span className="text-muted-foreground">
                      {translate('version', { version: receipt.version })}
                    </span>
                  </p>
                  {receipt.excerpt.trim() ? (
                    <p className="mt-0.5 text-muted-foreground">
                      {toExcerpt(receipt.excerpt)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {conflicts.length > 0 ? (
        <div
          className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2"
          data-testid="knowledge-conflicts"
        >
          <p className="text-2xs font-bold uppercase tracking-wide text-warning">
            {translate('conflictsTitle')}
          </p>
          <ul className="space-y-2">
            {conflicts.map((conflict) => (
              <li
                key={conflict.id}
                className="space-y-1 text-xs"
                data-testid={`knowledge-conflict-${conflict.id}`}
              >
                <p className="text-foreground">{conflict.summary}</p>
                <ul className="space-y-1">
                  {conflict.sources.map((source) => (
                    <li key={source.versionId} className="flex gap-2">
                      <span className="shrink-0 font-medium text-muted-foreground">
                        {source.marker === undefined
                          ? '•'
                          : `[${source.marker}]`}
                      </span>
                      <p className="min-w-0 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {source.title}
                        </span>{' '}
                        {translate('version', { version: source.version })}
                        {source.marker === undefined
                          ? ` · ${translate('conflictNotCited')}`
                          : null}
                        {': '}
                        {toExcerpt(source.excerpt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {citations.unsupportedCount > 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="knowledge-citations-unsupported"
        >
          {translate('unsupported', { count: citations.unsupportedCount })}
        </p>
      ) : null}
    </section>
  );
}
