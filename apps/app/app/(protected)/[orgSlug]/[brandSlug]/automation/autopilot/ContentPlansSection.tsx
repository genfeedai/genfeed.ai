'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IContentPlan } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import GeneratePlanDialog from './GeneratePlanDialog';
import { useContentPlansColumns } from './useContentPlansColumns';
import { useContentPlansSection } from './useContentPlansSection';

export default function ContentPlansSection() {
  const translate = useTranslations('common.automation.contentPlans');
  const {
    handleDialogChange,
    handleSubmit,
    isDialogOpen,
    isLoading,
    isSubmitting,
    plans,
    setIsDialogOpen,
  } = useContentPlansSection();
  const { columns } = useContentPlansColumns();

  return (
    <>
      <Card
        label={translate('title')}
        description={translate('description')}
        headerAction={
          <Button
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={() => setIsDialogOpen(true)}
          >
            <Sparkles className="size-4" /> {translate('generateCta')}
          </Button>
        }
      >
        <AppTable<IContentPlan>
          items={plans}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(plan) => plan.id}
          framed={false}
          emptyLabel={translate('emptyTitle')}
          emptyDescription={translate('emptyDescription')}
        />
      </Card>

      <GeneratePlanDialog
        isOpen={isDialogOpen}
        isSubmitting={isSubmitting}
        onOpenChange={handleDialogChange}
        onSubmit={handleSubmit}
      />
    </>
  );
}
