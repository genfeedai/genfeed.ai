'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  RecordFact,
  RecordFactLineProps,
} from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

const FACT_SEPARATOR = '·';
const DEFAULT_MAX_VISIBLE = 6;

function isPresentFactValue(value: RecordFact['value']): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  // Numbers (0 included) and any other rendered node count as known.
  return true;
}

/**
 * Up to `maxVisible` non-empty facts on one line; empty fields are omitted
 * entirely rather than shown as a "Set…" placeholder. Any further non-empty
 * facts sit behind an "All details" disclosure. One shared component for the
 * post, agent and campaign detail headers (see DESIGN.md → Collections →
 * "Record detail pages").
 */
export default function RecordFactLine({
  facts,
  maxVisible = DEFAULT_MAX_VISIBLE,
  className,
  'data-testid': dataTestId = 'record-fact-line',
}: RecordFactLineProps) {
  const translate = useTranslations('ui.recordDetail');
  const knownFacts = facts.filter((fact) => isPresentFactValue(fact.value));

  if (knownFacts.length === 0) {
    return null;
  }

  const visibleFacts = knownFacts.slice(0, maxVisible);
  const remainingFacts = knownFacts.slice(maxVisible);

  return (
    <div
      className={cn('flex flex-col gap-1', className)}
      data-testid={dataTestId}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {visibleFacts.map((fact, index) => (
          <Fragment key={fact.id}>
            {index > 0 ? (
              <span aria-hidden="true">{FACT_SEPARATOR}</span>
            ) : null}
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="text-foreground">{fact.label}</span>
              <span className="truncate">{fact.value}</span>
            </span>
          </Fragment>
        ))}
      </div>

      {remainingFacts.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="w-fit py-0 text-xs font-medium text-muted-foreground hover:text-foreground">
            {translate('allDetailsCount', { count: remainingFacts.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 pt-1 sm:grid-cols-2">
              {remainingFacts.map((fact) => (
                <div
                  className="flex items-baseline gap-1.5 text-sm"
                  key={fact.id}
                >
                  <dt className="text-foreground">{fact.label}</dt>
                  <dd className="min-w-0 truncate text-muted-foreground">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
