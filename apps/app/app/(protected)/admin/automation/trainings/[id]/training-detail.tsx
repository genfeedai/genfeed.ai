'use client';

import { TrainingProvider } from '@contexts/content/training-context/training-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ModalEnum,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { TrainingLayoutContentProps } from '@genfeedai/contracts/interfaces/training/training-layout-content.interface';
import { Code } from '@genfeedai/ui';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Training } from '@models/ai/training.model';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import Container from '@ui/layout/container/Container';
import { LazyModalTraining } from '@ui/lazy/modal/LazyModal';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { Database, Image, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function TrainingDetail({
  children,
  trainingId,
}: TrainingLayoutContentProps) {
  const translate = useTranslations('pages.adminTrainings');
  const { brands } = useBrand();

  const abortControllerRef = useRef<AbortController | null>(null);
  const notificationsService = NotificationsService.getInstance();

  const [training, setTraining] = useState<Training | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const abortCurrentTrainingLoad = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const loadTraining = useCallback(
    async (controller = new AbortController()) => {
      const url = `GET /trainings/${trainingId}`;

      try {
        setIsLoading(true);
        setError(null);

        abortCurrentTrainingLoad();
        abortControllerRef.current = controller;

        controller.signal.throwIfAborted();

        const service = await getTrainingsService();

        controller.signal.throwIfAborted();

        const data = await service.findOne(trainingId, {}, controller.signal);

        controller.signal.throwIfAborted();

        setTraining(data);
        logger.info(`${url} success`, data);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(`${url} failed`, error);
        const errorMessage = getErrorMessage(error, translate('loadError'));
        setError(errorMessage);
        notificationsService.error(translate('loadError'));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      abortCurrentTrainingLoad,
      getTrainingsService,
      notificationsService,
      trainingId,
      translate,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (trainingId) {
      void loadTraining(controller);
    }

    return abortCurrentTrainingLoad;
  }, [trainingId, loadTraining, abortCurrentTrainingLoad]);

  const isTrainingUnavailable = !isLoading && !training;

  // Static regardless of load state — the destinations and their badges
  // already degrade gracefully when `training` is null (badge omitted, not
  // a crash) — so the error branch below can render the exact same tab bar
  // instead of dropping it. Sharing this object is what keeps the two
  // branches' `headerTabs` from drifting apart and reintroducing the flip
  // this admin route had: an error after a successful load used to replace
  // the whole page (module chrome + tabs) with the bare classic error card.
  const trainingSubNavHeaderTabs = {
    fullWidth: false,
    tabs: [
      {
        badge:
          training?.totalGeneratedImages !== undefined ? (
            <Badge
              value={training.totalGeneratedImages}
              variant="info"
              size={ComponentSize.SM}
            />
          ) : undefined,
        href: `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/${trainingId}/images`,
        icon: Image,
        label: translate('images'),
      },
      {
        badge:
          training?.totalSources !== undefined ? (
            <Badge
              value={training.totalSources}
              variant="secondary"
              size={ComponentSize.SM}
            />
          ) : undefined,
        href: `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/${trainingId}/sources`,
        icon: Database,
        label: translate('sources'),
      },
    ],
  };

  if (error || isTrainingUnavailable) {
    return (
      <>
        <Container>
          <Card className="p-12 text-center">
            <div className="mx-auto mb-4 size-12 rounded-full bg-error/10 flex items-center justify-center">
              <span className="text-2xl text-error">!</span>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">
              {translate('loadError')}
            </h3>

            <p className="text-muted-foreground mb-4">
              {error || translate('notFound')}
            </p>

            <Button
              label={translate('retry')}
              onClick={() => {
                void loadTraining();
              }}
              className="mt-4"
            />
          </Card>
        </Container>

        <AdminPageShell
          title={translate('title')}
          tabs={trainingSubNavHeaderTabs}
          onRefresh={() => void loadTraining()}
        >
          {null}
        </AdminPageShell>
      </>
    );
  }

  const trainingAccount = training?.brand as IBrand | undefined;

  return (
    <>
      <Container>
        <Card>
          {training ? (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {training.label}
                  </h2>
                  <Button
                    icon={<Pencil />}
                    onClick={() => openModal(ModalEnum.TRAINING_EDIT)}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    tooltip={translate('editTraining')}
                  />
                </div>

                {training.description && (
                  <p className="text-muted-foreground mb-4">
                    {training.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {translate('status')}
                    </span>
                    <Badge status={training.status}>{training.status}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {translate('brand')}
                    </span>
                    <Code size="md">
                      {trainingAccount
                        ? brands.find(
                            (a: IBrand) => a.id === trainingAccount?.id,
                          )?.label ||
                          (trainingAccount as IBrand)?.label ||
                          translate('unknownBrand')
                        : '-'}
                    </Code>
                  </div>

                  {training.trigger && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {translate('trigger')}
                      </span>
                      <Code size="md">{training.trigger}</Code>
                    </div>
                  )}

                  {training.category && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {translate('category')}
                      </span>
                      <Code size="md">{training.category}</Code>
                    </div>
                  )}

                  {training.steps && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {translate('steps')}
                      </span>
                      <Code size="md">{training.steps}</Code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <SkeletonCard showImage={false} />
          )}
        </Card>

        {training && (
          <LazyModalTraining training={training} onSuccess={loadTraining} />
        )}
      </Container>

      <AdminPageShell
        title={translate('title')}
        tabs={trainingSubNavHeaderTabs}
        onRefresh={() => void loadTraining()}
      >
        {training ? (
          <TrainingProvider training={training} refreshTraining={loadTraining}>
            {children}
          </TrainingProvider>
        ) : (
          <Loading isFullSize={false} />
        )}
      </AdminPageShell>
    </>
  );
}
