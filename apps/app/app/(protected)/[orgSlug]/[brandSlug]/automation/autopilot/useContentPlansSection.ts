import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useContentPlans } from '@hooks/data/content-plans/use-content-plans';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { GeneratePlanFormState } from '@props/automation/content-plans-section.props';
import { ContentPlansService } from '@services/content/content-plans.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

export function useContentPlansSection() {
  const translate = useTranslations('common.automation.contentPlans');
  const scope = useCollectionScope();
  const { brandId } = scope;
  const isFetchReady = isCollectionFetchReady(scope) && Boolean(brandId);
  const notificationsService = NotificationsService.getInstance();
  const { plans, isLoading, refresh } = useContentPlans({
    brandId,
    enabled: isFetchReady,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getService = useAuthedService((token: string) =>
    ContentPlansService.getInstance(token),
  );

  const handleDialogChange = useCallback((isOpen: boolean) => {
    setIsDialogOpen(isOpen);
  }, []);

  const handleSubmit = useCallback(
    async (form: GeneratePlanFormState) => {
      if (!brandId) {
        notificationsService.error(translate('generateError'));
        return;
      }

      setIsSubmitting(true);
      try {
        const service = await getService();
        const topics = form.topics
          .split(',')
          .map((topic) => topic.trim())
          .filter((topic) => topic.length > 0);

        await service.generate(brandId, {
          itemCount: form.itemCount ? Number(form.itemCount) : undefined,
          periodEnd: form.periodEnd,
          periodStart: form.periodStart,
          seeds: {
            advertiserIds: form.advertiserIds,
            isImportedHistoryIncluded: form.isImportedHistoryIncluded,
            isPatternsIncluded: form.isPatternsIncluded,
            sourceIds: form.sourceIds,
          },
          topics: topics.length > 0 ? topics : undefined,
        });

        notificationsService.success(translate('generateSuccess'));
        handleDialogChange(false);
        await refresh();
      } catch (error) {
        logger.error('Failed to generate content plan', { error });
        notificationsService.error(translate('generateError'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      brandId,
      getService,
      handleDialogChange,
      notificationsService,
      refresh,
      translate,
    ],
  );

  return {
    brandId,
    handleDialogChange,
    handleSubmit,
    isDialogOpen,
    isLoading,
    isSubmitting,
    plans,
    setIsDialogOpen,
  };
}
