'use client';

import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import RowSidebarItemList from '@ui/display/row-sidebar/RowSidebarItemList';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarStats from '@ui/display/row-sidebar/RowSidebarStats';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { TrainingSidebarActivityProps } from '@/features/trainings/props/training-sidebar.props';

const RECENT_GENERATIONS_SHOWN = 3;

/**
 * The part of a training row's sidebar beyond its settings: how many images
 * it learned from and has made, and the latest images made with it.
 */
export default function TrainingSidebarActivity({
  training,
}: TrainingSidebarActivityProps) {
  const trainingT = useTranslations('ui.rowSidebar.training');
  const hasModel = Boolean(training.model);

  const imagesQuery = useAuthedQuery({
    enabled: hasModel,
    queryFn: async (service, signal) => {
      try {
        return await service.getTrainingImages(
          training.id,
          { limit: RECENT_GENERATIONS_SHOWN, page: 1 },
          signal,
        );
      } catch (error) {
        logger.error('Failed to fetch training sidebar images', error);
        throw error;
      }
    },
    queryKey: ['trainings', 'sidebar-images', training.id],
    service: (token: string) => TrainingsService.getInstance(token),
  });

  const images = imagesQuery.data?.items ?? [];

  return (
    <>
      <RowSidebarStats
        stats={[
          {
            id: 'sources',
            label: trainingT('sources'),
            value: formatCompactNumberIntl(training.totalSources ?? 0),
          },
          {
            id: 'generated',
            label: trainingT('generatedImages'),
            value: formatCompactNumberIntl(training.totalGeneratedImages ?? 0),
          },
        ]}
      />

      <RowSidebarSection title={trainingT('recentGenerations')}>
        <RowSidebarItemList
          emptyLabel={trainingT('noGenerations')}
          isLoading={hasModel && imagesQuery.isLoading}
          items={images.map((image) => ({
            id: image.id,
            meta: image.createdAt
              ? formatDistanceToNow(new Date(image.createdAt), {
                  addSuffix: true,
                })
              : undefined,
            title: image.generationPrompt?.trim() || trainingT('untitledImage'),
          }))}
        />
      </RowSidebarSection>
    </>
  );
}
