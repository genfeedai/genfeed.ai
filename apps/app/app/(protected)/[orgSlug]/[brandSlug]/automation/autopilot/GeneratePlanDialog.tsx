'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { GeneratePlanDialogProps } from '@props/automation/content-plans-section.props';
import PerformanceDatasetBadge, {
  LOW_CONFIDENCE_STATES,
} from '@ui/analytics/performance-dataset-badge/PerformanceDatasetBadge';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useGeneratePlanDialog } from './useGeneratePlanDialog';

export default function GeneratePlanDialog({
  isOpen,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: GeneratePlanDialogProps) {
  const translate = useTranslations('common.automation.contentPlans');
  const translateDataset = useTranslations(
    'pages.analytics.performanceDataset',
  );
  const { brandId } = useCollectionScope();
  const { form, handleSubmit, isLoadingSummary, setForm, summary } =
    useGeneratePlanDialog({ brandId, isOpen, onSubmit });

  const dataset = summary?.dataset;
  const isLowConfidence = dataset
    ? LOW_CONFIDENCE_STATES.includes(dataset.confidence)
    : false;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('dialogTitle')}</DialogTitle>
          <DialogDescription>
            {translate('dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {dataset && !isLoadingSummary ? (
          <Card variant={CardVariant.WHITE} bodyClassName="gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-foreground/70">
                {translateDataset('summaryLine', {
                  imported: dataset.importedPosts,
                  total: dataset.totalPosts,
                })}
              </p>
              <PerformanceDatasetBadge confidence={dataset.confidence} />
            </div>

            {isLowConfidence ? (
              <p className="text-xs text-foreground/55">
                {translate('dialogColdStartHint')}
              </p>
            ) : null}
          </Card>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="plan-period-start"
              >
                {translate('dialogPeriodStart')}
              </label>
              <Input
                id="plan-period-start"
                type="date"
                value={form.periodStart}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    periodStart: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="plan-period-end"
              >
                {translate('dialogPeriodEnd')}
              </label>
              <Input
                id="plan-period-end"
                type="date"
                value={form.periodEnd}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    periodEnd: event.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="plan-item-count"
            >
              {translate('dialogItemCount')}
            </label>
            <Input
              id="plan-item-count"
              type="number"
              min={1}
              max={50}
              value={form.itemCount}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  itemCount: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="plan-topics"
            >
              {translate('dialogAdditionalTopics')}
            </label>
            <Input
              id="plan-topics"
              value={form.topics}
              placeholder={translate('dialogTopicsPlaceholder')}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, topics: event.target.value }))
              }
            />
          </div>

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              label="Cancel"
              type="button"
              variant={ButtonVariant.SECONDARY}
              onClick={() => onOpenChange(false)}
            />
            <Button
              label={translate('dialogSubmit')}
              type="submit"
              variant={ButtonVariant.DEFAULT}
              isDisabled={isSubmitting}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
