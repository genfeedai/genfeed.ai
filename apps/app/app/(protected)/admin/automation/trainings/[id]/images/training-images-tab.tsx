'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { PageScope, TrainingStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { Code } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Image as LucideImage } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function TrainingImagesTab({
  scope = PageScope.ORGANIZATION,
}: {
  scope?: PageScope;
}) {
  const { training } = useTraining();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  const notificationsService = NotificationsService.getInstance();

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );
  const hasTrainingModel = Boolean(training?.model);

  const {
    data: generatedAssets = [],
    isLoading,
    error,
  } = useQuery<Image[]>({
    queryKey: [
      'training-images',
      training?.id,
      scope,
      training?.brand,
      currentPage,
    ],
    queryFn: async ({ signal }) => {
      const url = `GET /trainings/${training.id}/images`;
      const service = await getTrainingsService();
      const data = await service.getTrainingImages(
        training.id,
        {
          brand: scope === PageScope.BRAND ? training.brand : undefined,
          limit: ITEMS_PER_PAGE,
          page: currentPage,
        },
        signal,
      );
      logger.info(`${url} success`, data);
      return data;
    },
    enabled: hasTrainingModel,
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /trainings/:id/images failed', error);
      notificationsService.error('Failed to fetch generated assets');
    }
  }, [error, notificationsService]);

  if (error) {
    return (
      <CardEmptyContent
        icon={LucideImage}
        label="Generated assets failed to load"
        description="Refresh the page or try again in a moment."
      />
    );
  }

  if (!hasTrainingModel) {
    return (
      <CardEmptyContent
        icon={LucideImage}
        label="Training model unavailable"
        description="Generated assets can load once this training has a model."
      />
    );
  }

  const content =
    isLoading && generatedAssets.length === 0 ? (
      <IngredientsMediaGrid isLoading items={[]} />
    ) : generatedAssets.length === 0 ? (
      <div className="text-center py-12">
        <LucideImage className="mx-auto size-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No assets have been generated with this training model yet.
        </p>

        {training?.status === TrainingStatus.COMPLETED && (
          <p className="text-sm text-muted-foreground mt-2">
            Use the trigger word <Code>{training.trigger}</Code> in your prompts
          </p>
        )}
      </div>
    ) : (
      <IngredientsMediaGrid
        isActionsEnabled={false}
        isLoading={false}
        isTimeGroupingEnabled={false}
        items={generatedAssets}
      />
    );

  return (
    <>
      {content}
      <div className="mt-4">
        <AutoPagination showTotal totalLabel="images" />
      </div>
    </>
  );
}
