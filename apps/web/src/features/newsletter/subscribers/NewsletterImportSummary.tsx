'use client';

import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { useTranslations } from 'next-intl';
import type { NewsletterImportSummaryProps } from '@/features/newsletter/props/newsletter.props';

const SUMMARY_KEYS = ['added', 'duplicate', 'suppressed', 'invalid'] as const;

/** Counts for an add or import, preview or final. */
export default function NewsletterImportSummary({
  summary,
}: NewsletterImportSummaryProps) {
  const translate = useTranslations(
    'pages.publishing.newsletter.subscribers.summary',
  );
  const { invalidRows } = summary;

  return (
    <>
      <DefinitionList variant="properties">
        {SUMMARY_KEYS.map((key) => (
          <DefinitionRow key={key}>
            <DefinitionTerm>{translate(key)}</DefinitionTerm>
            <DefinitionDetail>{summary[key]}</DefinitionDetail>
          </DefinitionRow>
        ))}
      </DefinitionList>
      {invalidRows.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-foreground">
            {translate('invalidRowsTitle')}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {invalidRows.map((invalidRow) => (
              <li key={invalidRow.row} className="break-all">
                {invalidRow.value
                  ? translate('invalidRow', {
                      row: invalidRow.row,
                      value: invalidRow.value,
                    })
                  : translate('invalidRowEmpty', { row: invalidRow.row })}
              </li>
            ))}
          </ul>
          {summary.invalid > invalidRows.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {translate('invalidRowsMore', {
                shown: invalidRows.length,
                total: summary.invalid,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
