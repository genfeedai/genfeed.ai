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
  return (
    <DefinitionList variant="properties">
      {SUMMARY_KEYS.map((key) => (
        <DefinitionRow key={key}>
          <DefinitionTerm>{translate(key)}</DefinitionTerm>
          <DefinitionDetail>{summary[key]}</DefinitionDetail>
        </DefinitionRow>
      ))}
    </DefinitionList>
  );
}
