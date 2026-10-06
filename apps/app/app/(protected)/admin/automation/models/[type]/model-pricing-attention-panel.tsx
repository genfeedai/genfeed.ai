'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  AdminModelPricingRow,
  ModelPricingAttentionLevel,
} from '@genfeedai/contracts/interfaces';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAdminModelPricingReport } from './use-admin-model-pricing-report';

function reasonsFor(
  row: AdminModelPricingRow,
  level: ModelPricingAttentionLevel,
): string {
  return row.attention
    .filter((item) => item.level === level)
    .map((item) => item.reason)
    .join(' · ');
}

/**
 * Models that need an operator, red first (cannot be priced: price missing, zero
 * credits or unpriceable) then orange (a price still charges but needs review).
 */
export default function ModelPricingAttentionPanel() {
  const t = useTranslations('pages.adminModelPricing');
  const [isRedExpanded, setIsRedExpanded] = useState(false);
  const [isOrangeExpanded, setIsOrangeExpanded] = useState(false);
  const { data: report } = useAdminModelPricingReport();
  const { red, orange } = useMemo(() => {
    const rows = report?.rows ?? [];
    return {
      orange: rows.filter((row) => row.attentionLevel === 'orange'),
      red: rows.filter((row) => row.attentionLevel === 'red'),
    };
  }, [report]);

  if (red.length === 0 && orange.length === 0) return null;

  return (
    <section
      className="mb-4 space-y-3"
      data-testid="model-pricing-attention"
      aria-label={t('attentionLabel')}
    >
      {red.length > 0 ? (
        <Alert variant="destructive" data-testid="model-pricing-attention-red">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {t('attentionRedTitle', { count: red.length })}
          </AlertTitle>
          <AlertDescription>
            <p>{t('attentionRedHint')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {(isRedExpanded ? red : red.slice(0, 5)).map((row) => (
                <li key={row.id}>
                  <span className="font-medium">{row.key}</span>
                  {' — '}
                  {reasonsFor(row, 'red')}
                </li>
              ))}
            </ul>
            {red.length > 5 ? (
              <Button
                variant={ButtonVariant.GHOST}
                className="mt-2"
                aria-expanded={isRedExpanded}
                onClick={() => setIsRedExpanded(!isRedExpanded)}
              >
                {isRedExpanded
                  ? 'Show less'
                  : `Show ${red.length - 5} more models`}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {orange.length > 0 ? (
        <Alert variant="warning" data-testid="model-pricing-attention-orange">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            {t('attentionOrangeTitle', { count: orange.length })}
          </AlertTitle>
          <AlertDescription>
            <p>{t('attentionOrangeHint')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {(isOrangeExpanded ? orange : orange.slice(0, 5)).map((row) => (
                <li key={row.id}>
                  <span className="font-medium">{row.key}</span>
                  {' — '}
                  {reasonsFor(row, 'orange')}
                </li>
              ))}
            </ul>
            {orange.length > 5 ? (
              <Button
                variant={ButtonVariant.GHOST}
                className="mt-2"
                aria-expanded={isOrangeExpanded}
                onClick={() => setIsOrangeExpanded(!isOrangeExpanded)}
              >
                {isOrangeExpanded
                  ? 'Show less'
                  : `Show ${orange.length - 5} more models`}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
