'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  AdminModelPricingRow,
  ModelPricingAttentionLevel,
} from '@genfeedai/contracts/interfaces';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { CircleAlert, TriangleAlert, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAdminModelPricingReport } from './use-admin-model-pricing-report';
import { useFixModelPricing } from './use-fix-model-pricing';

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
  const { openConfirm } = useConfirmModal();
  const { fixAll, isFixing } = useFixModelPricing();
  const { red, orange } = useMemo(() => {
    const rows = report?.rows ?? [];
    return {
      orange: rows.filter((row) => row.attentionLevel === 'orange'),
      red: rows.filter((row) => row.attentionLevel === 'red'),
    };
  }, [report]);

  if (red.length === 0 && orange.length === 0) return null;

  const fixAllButton = (
    <Button
      icon={<Wrench aria-hidden="true" className="size-3.5" />}
      isDisabled={isFixing}
      onClick={() =>
        openConfirm({
          confirmLabel: t('fixAllConfirmLabel'),
          label: t('fixAllPricing'),
          message: t('fixAllConfirmMessage'),
          onConfirm: () => void fixAll(),
        })
      }
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
    >
      {isFixing ? t('fixingPricing') : t('fixAllPricing')}
    </Button>
  );

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
            <div className="mt-2">{fixAllButton}</div>
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
                  ? t('showLess')
                  : t('showMoreModels', { count: red.length - 5 })}
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
            {red.length === 0 ? (
              <div className="mt-2">{fixAllButton}</div>
            ) : null}
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
                  ? t('showLess')
                  : t('showMoreModels', { count: orange.length - 5 })}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
