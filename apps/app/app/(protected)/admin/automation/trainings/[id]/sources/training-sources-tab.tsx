'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import MasonryGrid from '@ui/masonry/grid/MasonryGrid';
import { useEffect, useRef, useState } from 'react';
import { FaDatabase } from 'react-icons/fa6';

export default function TrainingSourcesTab() {
  const { training } = useTraining();

  const notificationsService = NotificationsService.getInstance();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [sourceImages, setSourceImages] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  useEffect(() => {
    const findAllSources = async () => {
      const url = `GET /trainings/${training.id}/sources`;

      try {
        setIsLoading(true);
        const service = await getTrainingsService();

        const data = await service.getTrainingSources(training.id);

        if (!abortControllerRef.current?.signal.aborted) {
          setSourceImages(data);
        }

        logger.info(`${url} success`, data);
      } catch (error) {
        logger.error(`${url} failed`, error);
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        notificationsService.error('Failed to fetch training sources');
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void findAllSources();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [getTrainingsService, notificationsService, training]);

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
