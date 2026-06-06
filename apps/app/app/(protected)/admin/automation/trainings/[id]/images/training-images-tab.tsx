'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { PageScope, TrainingStatus } from '@genfeedai/enums';
import { Code } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import MasonryGrid from '@ui/masonry/grid/MasonryGrid';
import { useEffect } from 'react';
import { FaImage } from 'react-icons/fa6';

export default function TrainingImagesTab({
  scope = PageScope.ORGANIZATION,
}: {
  scope?: PageScope;
}) {
  const { training } = useTraining();

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
    queryKey: ['training-images', training?.id, scope, training?.brand],
    queryFn: async () => {
      const url = `GET /trainings/${training.id}/images`;
      const service = await getTrainingsService();
      const data = await service.getTrainingImages(training.id, {
        brand: scope === PageScope.BRAND ? training.brand : undefined,
      });
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
        icon={FaImage}
        label="Generated assets failed to load"
        description="Refresh the page or try again in a moment."
      />
    );
  }

  if (!hasTrainingModel) {
    return (
      <CardEmptyContent
        icon={FaImage}
        label="Training model unavailable"
        description="Generated assets can load once this training has a model."
      />
    );
  }

  return isLoading && generatedAssets.length === 0 ? (
    <MasonryGrid
      ingredients={[]}
      selectedIngredientId={[]}
      isActionsEnabled={false}
      isLoading
    />
  ) : generatedAssets.length === 0 ? (
    <div className="text-center py-12">
      <FaImage className="mx-auto size-12 text-muted-foreground mb-4" />
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
    <MasonryGrid
      ingredients={generatedAssets}
      selectedIngredientId={[]}
      isActionsEnabled={false}
    />
  );
}
