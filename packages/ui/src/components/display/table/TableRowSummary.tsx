'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { TableRowSummaryProps } from '@genfeedai/props/ui/display/table-row-summary.props';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Body of a row's right-sidebar detail (`rowSidebar.render`) for records that
 * need no bespoke panel: badges and an "Open" link to the detail page, the
 * known facts, then anything the caller adds.
 */
export default function TableRowSummary({
  badges,
  children,
  facts = [],
  openHref,
  openLabel,
}: TableRowSummaryProps) {
  const t = useTranslations('ui.rowSidebar');
  const knownFacts = facts.filter(
    (fact) =>
      fact.value !== undefined &&
      fact.value !== null &&
      !(typeof fact.value === 'string' && fact.value.trim() === ''),
  );

  return (
    <div className="flex flex-col" data-testid="table-row-summary">
      {badges || openHref ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
          {openHref ? (
            <Button
              asChild
              icon={<ExternalLink className="size-3.5" />}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <Link href={openHref}>{openLabel ?? t('open')}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {knownFacts.length > 0 ? (
        <DefinitionList className="space-y-3 p-4">
          {knownFacts.map((fact) => (
            <div key={fact.id}>
              <DefinitionTerm>{fact.label}</DefinitionTerm>
              <DefinitionDetail>{fact.value}</DefinitionDetail>
            </div>
          ))}
        </DefinitionList>
      ) : null}
      {children ? <div className="space-y-4 p-4">{children}</div> : null}
    </div>
  );
}
