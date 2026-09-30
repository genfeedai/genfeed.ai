'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { ButtonVariant, PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';
import type { AdminModelType } from '@props/admin/models.props';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import ModelPricingTable from './model-pricing-table';

export default function AdminModelsPageContent({
  type,
}: {
  type: AdminModelType;
}) {
  const [isPricingVisible, setIsPricingVisible] = useState(false);
  const { setRefreshModels } = useModelsContext();

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Button
          variant={
            isPricingVisible ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
          }
          aria-pressed={!isPricingVisible}
          onClick={() => setIsPricingVisible(false)}
        >
          Catalog
        </Button>
        <Button
          variant={
            isPricingVisible ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
          }
          aria-pressed={isPricingVisible}
          onClick={() => setIsPricingVisible(true)}
        >
          Pricing
        </Button>
      </div>
      {isPricingVisible ? (
        <ModelPricingTable />
      ) : (
        <ModelsList
          category={type}
          scope={PageScope.SUPERADMIN}
          onRefreshRegister={setRefreshModels}
        />
      )}
    </>
  );
}
