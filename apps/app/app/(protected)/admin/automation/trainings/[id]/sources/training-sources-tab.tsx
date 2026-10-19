'use client';

import { useTraining } from '@contexts/content/training-context/training-context';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Database } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function TrainingSourcesTab() {
  const { training } = useTraining();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  const notificationsService = NotificationsService.getInstance();

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const {
    data: sourceImages = [],
    isLoading,
    error,
  } = useQuery<Image[]>({
    queryKey: ['training-sources', training.id, currentPage],
    queryFn: async ({ signal }) => {
      const url = `GET /trainings/${training.id}/sources`;
      const service = await getTrainingsService();
      const data = await service.getTrainingSources(
        training.id,
        { limit: ITEMS_PER_PAGE, page: currentPage },
        signal,
      );
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

  const content =
    isLoading && sourceImages.length === 0 ? (
      <IngredientsMediaGrid isLoading items={[]} />
    ) : sourceImages.length === 0 ? (
      <div className="text-center py-12">
        <Database className="mx-auto size-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No training sources available.</p>
      </div>
    ) : (
      <IngredientsMediaGrid
        isActionsEnabled={false}
        isLoading={false}
        isTimeGroupingEnabled={false}
        items={sourceImages}
      />
    );

  return (
    <>
      {content}
      <div className="mt-4">
        <AutoPagination showTotal totalLabel="sources" />
      </div>
    </>
  );
}
