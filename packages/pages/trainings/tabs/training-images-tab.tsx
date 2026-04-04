'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { TrainingStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import MasonryGrid from '@ui/masonry/grid/MasonryGrid';
import { PageScope } from '@ui-constants/misc.constant';
import { useEffect, useRef, useState } from 'react';
import { FaImage } from 'react-icons/fa6';

export default function TrainingImagesTab({
  scope = PageScope.ORGANIZATION,
}: {
  scope?: PageScope;
}) {
  const { training } = useTraining();

  const notificationsService = NotificationsService.getInstance();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [generatedAssets, setGeneratedAssets] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const findAllImages = async () => {
    if (!training?.model) {
      return;
    }

    const url = `GET /trainings/${training.id}/images`;

    try {
      setIsLoading(true);
      const service = await getTrainingsService();

      const query: Record<string, unknown> = {};

      if (scope === PageScope.BRAND) {
        query.brand = training.brand;
      }

      const data = await service.getTrainingImages(training.id, {
        brand: training.brand,
      });

      if (!abortControllerRef.current?.signal.aborted) {
        setGeneratedAssets(data);
      }

      logger.info(`${url} success`, data);
    } catch (error) {
      logger.error(`${url} failed`, error);
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      notificationsService.error('Failed to fetch generated assets');
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    findAllImages();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [findAllImages]);

  if (isLoading && generatedAssets.length === 0) {
    return (
      <MasonryGrid
        ingredients={[]}
        selectedIngredientId={[]}
        isActionsEnabled={false}
        isLoading
      />
    );
  }

  if (generatedAssets.length === 0) {
    return (
      <div className="text-center py-12">
        <FaImage className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No assets have been generated with this training model yet.
        </p>

        {training?.status === TrainingStatus.COMPLETED && (
          <p className="text-sm text-muted-foreground mt-2">
            Use the trigger word{' '}
            <code className="bg-muted px-2 py-1">{training.trigger}</code> in
            your prompts
          </p>
        )}
      </div>
    );
  }

  return (
    <MasonryGrid
      ingredients={generatedAssets}
      selectedIngredientId={[]}
      isActionsEnabled={false}
    />
  );
}
