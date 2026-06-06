'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import MasonryGrid from '@ui/masonry/grid/MasonryGrid';
import { useEffect } from 'react';
import { FaDatabase } from 'react-icons/fa6';

export default function TrainingSourcesTab() {
  const { training } = useTraining();

  const notificationsService = NotificationsService.getInstance();

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const {
    data: sourceImages = [],
    isLoading,
    error,
  } = useQuery<Image[]>({
    queryKey: ['training-sources', training.id],
    queryFn: async () => {
      const url = `GET /trainings/${training.id}/sources`;
      const service = await getTrainingsService();
      const data = await service.getTrainingSources(training.id);
      logger.info(`${url} success`, data);
      return data;
    },
    enabled: Boolean(training.id),
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /trainings/:id/sources failed', error);
      notificationsService.error('Failed to fetch training sources');
    }
  }, [error, notificationsService]);

  return isLoading && sourceImages.length === 0 ? (
    <MasonryGrid
      ingredients={[]}
      selectedIngredientId={[]}
      isActionsEnabled={false}
      isLoading
    />
  ) : sourceImages.length === 0 ? (
    <div className="text-center py-12">
      <FaDatabase className="mx-auto size-12 text-muted-foreground mb-4" />
      <p className="text-muted-foreground">No training sources available.</p>
    </div>
  ) : (
    <MasonryGrid
      ingredients={sourceImages}
      selectedIngredientId={[]}
      isActionsEnabled={false}
    />
  );
}
