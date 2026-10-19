'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IContentPlan } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
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
  const rowSidebar = createSummaryRowSidebar<IContentPlan>({
    getBadges: (plan) => <Badge status={plan.status} />,
    getFacts: (plan) => [
      {
        id: 'period',
        label: translate('columnPeriod'),
        value: `${formatDate(plan.periodStart)} – ${formatDate(plan.periodEnd)}`,
      },
      {
        id: 'items',
        label: translate('columnItems'),
        value: `${plan.executedCount} / ${plan.itemCount}`,
      },
    ],
    getId: (plan) => plan.id,
    getTitle: (plan) => plan.name,
    kind: 'record',
  });

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
          rowSidebar={rowSidebar}
          framed={false}
          emptyLabel={translate('emptyTitle')}
          emptyDescription={translate('emptyDescription')}
        />
        {!isLoading && plans.length > 0 ? (
          <AutoPagination showTotal totalLabel="plans" />
        ) : null}
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
