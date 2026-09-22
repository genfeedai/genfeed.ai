'use client';

import ExpertStepHeader from '@app/(onboarding)/onboarding/(wizard)/_expert/expert-step-header';
import FirstSystemItemRow from '@app/(onboarding)/onboarding/(wizard)/_expert/first-system-item-row';
import { useCompleteOnboarding } from '@app/(onboarding)/onboarding/(wizard)/_expert/use-complete-onboarding.hook';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  ExpertFirstSystemItemAction,
  IContentPlanItem,
  IExpertPathStatus,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ExpertPathService } from '@services/content/expert-path.service';
import { logger } from '@services/core/logger.service';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

type FirstSystemErrorKey = 'load' | 'generate' | 'review';

export default function FirstSystemContent() {
  const translate = useTranslations('pages.onboarding.expert');
  const { selectedBrand } = useBrand();
  const brandId = selectedBrand?.id ?? null;
  const completeOnboarding = useCompleteOnboarding();

  const getExpertPathService = useAuthedService((token: string) =>
    ExpertPathService.getInstance(token),
  );

  const [status, setStatus] = useState<IExpertPathStatus | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [items, setItems] = useState<IContentPlanItem[]>([]);
  const [connectToSchedulePlatforms, setConnectToSchedulePlatforms] = useState<
    string[]
  >([]);
  const [corpusSourceCount, setCorpusSourceCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [isEntering, setIsEntering] = useState(false);
  const [errorKey, setErrorKey] = useState<FirstSystemErrorKey | null>(null);

  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();

    const load = async () => {
      try {
        const service = await getExpertPathService();
        const [nextStatus, existing] = await Promise.all([
          service.getStatus(brandId, controller.signal),
          service.getFirstSystem(brandId, controller.signal),
        ]);
        if (controller.signal.aborted) {
          return;
        }
        setStatus(nextStatus);
        if (existing) {
          setPlanId(String(existing.plan.id));
          setItems(existing.items);
          setConnectToSchedulePlatforms(
            existing.provenance?.connectToSchedulePlatforms ?? [],
          );
          setCorpusSourceCount(
            existing.provenance?.corpusSourceIds.length ?? 0,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load the Expert Path first system', error);
        setErrorKey('load');
      }
    };

    void load();
    return () => controller.abort();
  }, [brandId, getExpertPathService]);

  const handleGenerate = useCallback(async () => {
    if (!brandId) {
      return;
    }
    setIsGenerating(true);
    setErrorKey(null);
    try {
      const result = await (await getExpertPathService()).generateFirstSystem(
        brandId,
      );
      setPlanId(String(result.plan.id));
      setItems(result.items);
      setConnectToSchedulePlatforms(
        result.provenance?.connectToSchedulePlatforms ?? [],
      );
      setCorpusSourceCount(result.provenance?.corpusSourceIds.length ?? 0);
      captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_FIRST_SYSTEM_GENERATED, {
        isUsingInterviewPlatforms:
          (result.provenance?.connectToSchedulePlatforms.length ?? 0) > 0,
        itemCount: result.items.length,
        outcome: 'success',
      });
    } catch (error) {
      logger.error('Failed to generate the first content system', error);
      captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_FIRST_SYSTEM_GENERATED, {
        isUsingInterviewPlatforms: false,
        itemCount: 0,
        outcome: 'failure',
      });
      setErrorKey('generate');
    } finally {
      setIsGenerating(false);
    }
  }, [brandId, getExpertPathService]);

  const reviewItem = useCallback(
    async (
      item: IContentPlanItem,
      action: ExpertFirstSystemItemAction,
      topic?: string,
    ) => {
      if (!brandId || !planId) {
        return;
      }
      setBusyItemId(item.id);
      setErrorKey(null);
      try {
        const updated = await (
          await getExpertPathService()
        ).reviewFirstSystemItem(brandId, planId, item.id, {
          action,
          ...(topic ? { topic } : {}),
        });
        setItems((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        captureAnalyticsEvent(
          ANALYTICS_EVENTS.EXPERT_FIRST_SYSTEM_ITEM_REVIEWED,
          { action },
        );
      } catch (error) {
        logger.error('Failed to review a first system item', error);
        setErrorKey('review');
      } finally {
        setBusyItemId(null);
      }
    },
    [brandId, getExpertPathService, planId],
  );

  const handleEnterWorkspace = useCallback(async () => {
    setIsEntering(true);
    captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_ONBOARDING_STEP, {
      action: 'completed',
      step: 'first-system',
    });
    await completeOnboarding();
  }, [completeOnboarding]);

  const readiness = status?.firstSystem.readiness;
  const hasPlan = items.length > 0;

  return (
    <div className="space-y-8">
      <ExpertStepHeader
        title={translate('firstSystem.title')}
        description={translate('firstSystem.description')}
        isFinalStep
      />

      {readiness && !readiness.isReady && !hasPlan ? (
        <div className="max-w-2xl space-y-3 border border-border bg-background-tertiary p-6">
          <p className="text-sm font-medium text-foreground">
            {translate('firstSystem.missingTitle')}
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {readiness.missing.includes('positioning') ? (
              <li>
                <Link
                  href={APP_ROUTES.ONBOARDING.POSITIONING}
                  className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
                >
                  {translate('firstSystem.missingPositioning')}
                </Link>
              </li>
            ) : null}
            {readiness.missing.includes('corpus') ? (
              <li>
                <Link
                  href={APP_ROUTES.ONBOARDING.CORPUS}
                  className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
                >
                  {translate('firstSystem.missingCorpus')}
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {readiness?.isReady && !hasPlan ? (
        <div className="max-w-2xl space-y-3">
          <p className="text-sm text-muted-foreground">
            {translate('firstSystem.cost', { credits: readiness.creditCost })}
          </p>
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.DEFAULT}
            label={translate('firstSystem.generate')}
            icon={<Sparkles className="size-4" />}
            isLoading={isGenerating}
            onClick={handleGenerate}
            className="rounded-none px-5"
          />
          {isGenerating ? (
            <p className="text-xs text-muted-foreground">
              {translate('firstSystem.generating')}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasPlan ? (
        <div className="max-w-2xl space-y-4">
          <p className="text-xs text-muted-foreground">
            {translate('firstSystem.grounded', { sources: corpusSourceCount })}
          </p>
          <ul className="divide-y divide-border border border-border">
            {items.map((item) => (
              <FirstSystemItemRow
                key={item.id}
                connectToSchedulePlatforms={connectToSchedulePlatforms}
                isBusy={busyItemId === item.id}
                item={item}
                onApprove={(target) => reviewItem(target, 'approve')}
                onEdit={(target, topic) => reviewItem(target, 'edit', topic)}
                onReject={(target) => reviewItem(target, 'reject')}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {errorKey ? (
        <div className="max-w-2xl">
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              <div className="font-medium">
                {translate('common.errorTitle')}
              </div>
              <div className="text-xs text-foreground/70">
                {translate(`firstSystem.errors.${errorKey}`)}
              </div>
            </div>
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.DEFAULT}
          label={translate('firstSystem.enterWorkspace')}
          icon={<ArrowRight className="size-4" />}
          isLoading={isEntering}
          onClick={handleEnterWorkspace}
          className="rounded-none px-5"
        />
        {errorKey === 'generate' ? (
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.DEFAULT}
            label={translate('common.retry')}
            isLoading={isGenerating}
            onClick={handleGenerate}
            className="rounded-none px-5"
          />
        ) : null}
      </div>
    </div>
  );
}
