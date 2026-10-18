'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAdminModelPricingReport } from './use-admin-model-pricing-report';
import { canFixPricing, useFixModelPricing } from './use-fix-model-pricing';

/** Sits beside a model's cost when its price is missing. */
export default function FixPricingButton({ model }: { model: IModel }) {
  const t = useTranslations('pages.adminModelPricing');
  const { data: report } = useAdminModelPricingReport();
  const { fixModel, isFixing } = useFixModelPricing();
  const row = report?.rows.find((entry) => entry.id === model.id);

  if (!canFixPricing(row)) return null;

  return (
    <Button
      ariaLabel={`${t('fixPricing')}: ${model.label}`}
      icon={<Wrench className="size-3.5" />}
      isDisabled={isFixing}
      onClick={() => void fixModel(model.id)}
      size={ButtonSize.XS}
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
    >
      {isFixing ? t('fixingPricing') : t('fixPricing')}
    </Button>
  );
}
