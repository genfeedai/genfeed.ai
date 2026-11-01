'use client';
import { useTraining } from '@contexts/content/training-context/training-context';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Image } from '@models/ingredients/image.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { EmptyState } from '@ui/primitives/empty-state';
import { Database } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import IngredientsMediaGrid from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';

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
      <EmptyState icon={Database} title="No training sources available." />
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
