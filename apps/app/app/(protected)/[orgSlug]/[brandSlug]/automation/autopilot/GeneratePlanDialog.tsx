'use client';

import {
  ButtonVariant,
  CardVariant,
  SocialSourceType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { GeneratePlanDialogProps } from '@props/automation/content-plans-section.props';
import PerformanceDatasetBadge, {
  LOW_CONFIDENCE_STATES,
} from '@ui/analytics/performance-dataset-badge/PerformanceDatasetBadge';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import Link from 'next/link';
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
  const { href } = useOrgUrl();
  const {
    form,
    handleSubmit,
    isLoadingSummary,
    seedPreview,
    setForm,
    setIsImportedHistoryIncluded,
    setIsPatternsIncluded,
    summary,
    toggleAdvertiser,
    toggleSource,
  } = useGeneratePlanDialog({ brandId, isOpen, onSubmit });

  const dataset = summary?.dataset;
  const isLowConfidence = dataset
    ? LOW_CONFIDENCE_STATES.includes(dataset.confidence)
    : false;

  const followableSources =
    seedPreview?.sources.filter(
      (source) => source.sourceType !== SocialSourceType.OWN_ACCOUNT,
    ) ?? [];
  const isOwnHistoryEligible =
    (seedPreview?.importedPostCount ?? 0) > 0 || (dataset?.totalPosts ?? 0) > 0;
  const isPatternsEligible = (seedPreview?.patternCount ?? 0) > 0;

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

        <Form onSubmit={handleSubmit}>
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

          {seedPreview ? (
            <Collapsible defaultOpen={seedPreview.isColdStart}>
              <CollapsibleTrigger className="text-sm font-medium text-foreground">
                {translate('seedSectionTitle')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    <p className="gen-label-sm text-foreground/60">
                      {translate('seedAdvertisersTitle')}
                    </p>
                    {seedPreview.advertisers.length === 0 ? (
                      <p className="text-xs text-foreground/55">
                        {translate('seedAdvertisersEmpty')}{' '}
                        <Link
                          href={href(APP_ROUTES.DISCOVERY.ADS)}
                          className="underline"
                        >
                          {translate('seedAdvertisersEmptyCta')}
                        </Link>
                      </p>
                    ) : (
                      seedPreview.advertisers.map((advertiser) => (
                        <Checkbox
                          key={advertiser.id}
                          name={`seed-advertiser-${advertiser.id}`}
                          isChecked={form.advertiserIds.includes(advertiser.id)}
                          onCheckedChange={(checked) =>
                            toggleAdvertiser(advertiser.id, checked === true)
                          }
                          label={
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {translate('seedAdvertiserAdCount', {
                                  count: advertiser.adCount,
                                  name: advertiser.name,
                                  platform: advertiser.platform,
                                })}
                              </span>
                              {advertiser.topHeadline ? (
                                <span className="text-xs text-foreground/50">
                                  {advertiser.topHeadline}
                                </span>
                              ) : null}
                            </div>
                          }
                        />
                      ))
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="gen-label-sm text-foreground/60">
                      {translate('seedSourcesTitle')}
                    </p>
                    {followableSources.length === 0 ? (
                      <p className="text-xs text-foreground/55">
                        {translate('seedSourcesEmpty')}{' '}
                        <Link
                          href={href(APP_ROUTES.DISCOVERY.OVERVIEW)}
                          className="underline"
                        >
                          {translate('seedSourcesEmptyCta')}
                        </Link>
                      </p>
                    ) : (
                      followableSources.map((source) => (
                        <Checkbox
                          key={source.id}
                          name={`seed-source-${source.id}`}
                          isChecked={form.sourceIds.includes(source.id)}
                          onCheckedChange={(checked) =>
                            toggleSource(source.id, checked === true)
                          }
                          label={
                            <span className="text-sm">
                              {translate('seedSourceHandlePlatform', {
                                count: source.postCount,
                                handle: source.handle,
                                platform: source.platform,
                              })}
                            </span>
                          }
                        />
                      ))
                    )}
                  </div>

                  {isOwnHistoryEligible ? (
                    <Switch
                      isChecked={form.isImportedHistoryIncluded}
                      onCheckedChange={setIsImportedHistoryIncluded}
                      label={translate('seedIncludeOwnHistory', {
                        count: seedPreview.importedPostCount,
                      })}
                    />
                  ) : null}

                  {isPatternsEligible ? (
                    <Switch
                      isChecked={form.isPatternsIncluded}
                      onCheckedChange={setIsPatternsIncluded}
                      label={translate('seedIncludePatterns', {
                        count: seedPreview.patternCount,
                      })}
                    />
                  ) : null}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              label={translate('dialogCancel')}
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
