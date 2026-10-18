'use client';

import { PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';
import type { AdminModelsPageContentProps } from '@props/admin/models.props';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import FixPricingButton from './fix-pricing-button';
import ModelPricingAttentionPanel from './model-pricing-attention-panel';
import ModelPricingDetails, {
  ModelPricingToolbar,
} from './model-pricing-details';
import { ADMIN_MODEL_PRICING_QUERY_KEY } from './use-admin-model-pricing-report';

export default function AdminModelsPageContent({
  type,
}: AdminModelsPageContentProps) {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const queryClient = useQueryClient();
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
      category={type}
      scope={PageScope.SUPERADMIN}
      onRefresh={refreshPricing}
      onPricingDetails={(model) =>
        setExpandedModelId((id) => (id === model.id ? null : model.id))
      }
      renderExpandedRow={(model) =>
        expandedModelId === model.id ? (
          <ModelPricingDetails modelId={model.id} />
        ) : undefined
      }
      renderCostAction={(model) => <FixPricingButton model={model} />}
      renderToolbar={(models) => <ModelPricingToolbar models={models} />}
    />
  );
}
