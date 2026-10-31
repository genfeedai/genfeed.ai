'use client';

import { PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import { useQueryClient } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import ModelsList from '@/features/models/list/models-list';
import type { AdminModelsPageContentProps } from '@/features/models/props/models.props';
import ModelPricingAttentionPanel from './model-pricing-attention-panel';
import { ModelPricingToolbar } from './model-pricing-details';
import {
  ADMIN_MODEL_PRICING_QUERY_KEY,
  useAdminModelPricingReport,
} from './use-admin-model-pricing-report';
import { canFixPricing, useFixModelPricing } from './use-fix-model-pricing';

export default function AdminModelsPageContent({
  type,
}: AdminModelsPageContentProps) {
  const t = useTranslations('pages.adminModelPricing');
  const queryClient = useQueryClient();
  const { data: report } = useAdminModelPricingReport();
  const { fixModel, isFixing } = useFixModelPricing();
  const rowsById = useMemo(
    () => new Map((report?.rows ?? []).map((row) => [row.id, row])),
    [report],
  );
  const isModelPinned = useCallback(
    (model: IModel) => canFixPricing(rowsById.get(model.id)),
    [rowsById],
  );
  const rowActions = useMemo<TableAction<IModel>[]>(
    () => [
      {
        icon: <Wrench />,
        isDisabled: () => isFixing,
        isVisible: isModelPinned,
        onClick: (model) => void fixModel(model.id),
        tooltip: (model) => `${t('fixPricing')}: ${model.label}`,
      },
    ],
    [fixModel, isFixing, isModelPinned, t],
  );
  const refreshPricing = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ADMIN_MODEL_PRICING_QUERY_KEY,
      }),
    [queryClient],
  );
  return (
    <ModelsList
      beforeList={<ModelPricingAttentionPanel />}
      getModelHref={(model) =>
        `/admin/automation/models/${type}/${encodeURIComponent(model.id)}`
      }
      category={type}
      scope={PageScope.SUPERADMIN}
      onRefresh={refreshPricing}
      rowActions={rowActions}
      isModelPinned={isModelPinned}
      renderToolbar={(models) => <ModelPricingToolbar models={models} />}
    />
  );
}
