'use client';

import type { IBrand } from '@genfeedai/interfaces';
import type { TrainingLayoutContentProps } from '@genfeedai/interfaces/training/training-layout-content.interface';
import { TrainingProvider } from '@contexts/content/training-context/training-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ModalEnum,
} from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Training } from '@models/ai/training.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { LazyModalTraining } from '@ui/lazy/modal/LazyModal';
import { Code } from '@genfeedai/ui';
import Loading from '@ui/loading/default/Loading';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HiCircleStack, HiPencil, HiPhoto } from 'react-icons/hi2';

export default function TrainingDetail({
  children,
  trainingId,
}: TrainingLayoutContentProps) {
  const { brands } = useBrand();
  const pathname = usePathname();

  const abortControllerRef = useRef<AbortController | null>(null);
  const notificationsService = NotificationsService.getInstance();

  const [training, setTraining] = useState<Training | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const loadTraining = async () => {
    const url = `GET /trainings/${trainingId}`;

    try {
      setIsLoading(true);
      setError(null);

      abortControllerRef.current = new AbortController();
      const service = await getTrainingsService();

      const data = await service.findOne(trainingId);

      if (!abortControllerRef.current?.signal.aborted) {
        setTraining(data);
      }

      logger.info(`${url} success`, data);
    } catch (error) {
      logger.error(`${url} failed`, error);
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const errorMessage = getErrorMessage(
        error,
        'Failed to load training details',
      );
      setError(errorMessage);
      notificationsService.error('Failed to load training details');
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (trainingId) {
      loadTraining();
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [trainingId, loadTraining]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (error || !training) {
    return (
      <Container>
        <Card className="p-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <span className="text-2xl">!</span>
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            Failed to load training details
          </h3>

          <p className="text-muted-foreground mb-4">
            {error || 'Training not found'}
          </p>

          <Button label="Try Again" onClick={loadTraining} className="mt-4" />
        </Card>
      </Container>
    );
  }

  const trainingAccount = training.brand as IBrand;

  return (
    <TrainingProvider training={training} refreshTraining={loadTraining}>
      <Container>
        <Breadcrumb
          segments={[
            { href: '/trainings', label: 'Trainings' },
            {
              href: pathname,
              label: training.label || training.id,
            },
          ]}
        />

        <Card>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-2xl font-bold text-foreground">
                  {training.label}
                </h1>
                <Button
                  icon={<HiPencil />}
                  onClick={() => openModal(ModalEnum.TRAINING_EDIT)}
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                  tooltip="Edit Training"
                />
              </div>

              {training.description && (
                <p className="text-muted-foreground mb-4">
                  {training.description}
                </p>
              )}

              <div className="flex flex-wrap gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge status={training.status}>{training.status}</Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Brand</span>
                  <Code size="md">
                    {trainingAccount
                      ? brands.find((a: IBrand) => a.id === trainingAccount?.id)
                          ?.label ||
                        (trainingAccount as IBrand)?.label ||
                        'Unknown'
                      : '-'}
                  </Code>
                </div>

                {training.trigger && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Trigger
                    </span>
                    <Code size="md">
                      {training.trigger}
                    </Code>
                  </div>
                )}

                {training.category && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Category
                    </span>
                    <Code size="md">
                      {training.category}
                    </Code>
                  </div>
                )}

                {training.steps && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Steps</span>
                    <Code size="md">
                      {training.steps}
                    </Code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <LazyModalTraining training={training} onSuccess={loadTraining} />
      </Container>

      <Container
        tabs={[
          {
            badge:
              training.totalGeneratedImages !== undefined ? (
                <Badge
                  value={training.totalGeneratedImages}
                  variant="info"
                  size={ComponentSize.SM}
                />
              ) : undefined,
            href: `/trainings/${trainingId}/images`,
            icon: HiPhoto,
            label: 'Images',
          },
          {
            badge:
              training.totalSources !== undefined ? (
                <Badge
                  value={training.totalSources}
                  variant="secondary"
                  size={ComponentSize.SM}
                />
              ) : undefined,
            href: `/trainings/${trainingId}/sources`,
            icon: HiCircleStack,
            label: 'Sources',
          },
        ]}
      >
        {children}
      </Container>
    </TrainingProvider>
  );
}
