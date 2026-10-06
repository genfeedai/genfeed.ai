'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';
import type { AdminModelsPageContentProps } from '@props/admin/models.props';
import { useState } from 'react';
import ModelPricingAttentionPanel from './model-pricing-attention-panel';
import ModelPricingDetails, {
  ModelPricingToolbar,
} from './model-pricing-details';

export default function AdminModelsPageContent({
  type,
}: AdminModelsPageContentProps) {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const { setRefreshModels } = useModelsContext();
  return (
    <>
      <ModelPricingAttentionPanel />
      <ModelsList
        category={type}
        scope={PageScope.SUPERADMIN}
        onRefreshRegister={setRefreshModels}
        onPricingDetails={(model) =>
          setExpandedModelId((id) => (id === model.id ? null : model.id))
        }
        renderExpandedRow={(model) =>
          expandedModelId === model.id ? (
            <ModelPricingDetails modelId={model.id} />
          ) : undefined
        }
        renderToolbar={(models) => <ModelPricingToolbar models={models} />}
      />
    </>
  );
}
