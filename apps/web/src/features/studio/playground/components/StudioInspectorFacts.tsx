'use client';

import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioInspectorFactsProps } from '@/features/studio/props/studio-playground-inspector.props';

const CREDITS_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

/** The asset's type, model, shape, cost and creation time, one row each. */
export default function StudioInspectorFacts({
  facts,
  generationCost,
  label,
}: StudioInspectorFactsProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const factRows = [
    { key: 'type', label: translate('inspector.facts.type'), value: label },
    {
      key: 'model',
      label: translate('inspector.facts.model'),
      value: facts.modelLabel || translate('inspector.autoModel'),
    },
    ...(facts.aspectRatio
      ? [
          {
            key: 'aspect',
            label: translate('inspector.facts.aspect'),
            value: facts.aspectRatio,
          },
        ]
      : []),
    ...(facts.durationSeconds
      ? [
          {
            key: 'duration',
            label: translate('inspector.facts.duration'),
            value: translate('inspector.durationSeconds', {
              seconds: Math.round(facts.durationSeconds),
            }),
          },
        ]
      : []),
    ...(generationCost?.credits == null
      ? []
      : [
          {
            key: 'credits',
            label: translate('inspector.facts.credits'),
            value:
              generationCost.status === 'reserved'
                ? translate('inspector.facts.creditsReserved', {
                    count: CREDITS_FORMAT.format(generationCost.credits),
                  })
                : CREDITS_FORMAT.format(generationCost.credits),
          },
        ]),
    ...(facts.createdAt
      ? [
          {
            key: 'created',
            label: translate('inspector.facts.created'),
            value: formatDate(facts.createdAt, DATE_FORMATS.DISPLAY_DATETIME),
          },
        ]
      : []),
    ...(facts.brandLabel
      ? [
          {
            key: 'brand',
            label: translate('inspector.facts.brand'),
            value: facts.brandLabel,
          },
        ]
      : []),
  ];
  return (
    <DefinitionList variant="properties">
      {factRows.map((row) => (
        <DefinitionRow key={row.key}>
          <DefinitionTerm variant="muted">{row.label}</DefinitionTerm>
          <DefinitionDetail className="truncate text-right" variant="compact">
            {row.value}
          </DefinitionDetail>
        </DefinitionRow>
      ))}
    </DefinitionList>
  );
}
