'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  ModalEnum,
  PageScope,
  TrainingStatus,
} from '@genfeedai/enums';
import type { ITraining } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Training } from '@models/ai/training.model';
import type { ContentProps } from '@props/layout/content.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CardEmpty from '@ui/card/empty/CardEmpty';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import {
  LazyModalTraining,
  LazyModalTrainingNew,
} from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineCpuChip, HiPlus } from 'react-icons/hi2';
import TrainingsErrorState from './components/TrainingsErrorState';
import { buildTrainingsTableActions } from './components/TrainingsTableActions';
import { buildTrainingsTableColumns } from './components/TrainingsTableColumns';

export default function TrainingsList({
  scope = PageScope.ORGANIZATION,
  hideContainer = false,
  onRefreshRegister,
}: ContentProps & {
  hideContainer?: boolean;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
}) {
  type TrainingStatusUpdate = {
    status: Training['status'];
    trainingId: string;
    progress?: Partial<Training>;
  };

  const { isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const { brandId } = useBrand();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const { subscribe } = useSocketManager();

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const [selectedTraining, setSelectedTraining] = useState<Training | null>(
    null,
  );

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      setAdminOrg(orgId);
      setAdminBrand('');
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      setAdminBrand(brandId);
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  // Track if component is mounted to avoid calling callbacks during initial render
  const isMountedRef = useRef(false);

  const queryClient = useQueryClient();

  const trainingsQueryKey = [
    'trainings-list',
    scope,
    brandId,
    adminOrg,
    adminBrand,
  ] as const;

  const {
    data: trainings = [] as Training[],
    isLoading,
    isFetching,
    refetch: refetchTrainings,
    error: fetchError,
  } = useQuery<Training[]>({
    enabled: !!isSignedIn,
    queryFn: async () => {
      const service = await getTrainingsService();

      const query: Record<string, unknown> = {
        pagination: false,
      };

      if (scope === PageScope.BRAND) {
        query.brand = brandId;
      }

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      }

      const data = await service.findAll(query);
      logger.info('GET /trainings success', data);
      return data;
    },
    queryKey: trainingsQueryKey,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (fetchError instanceof Error) {
      logger.error('GET /trainings failed', fetchError);
      notificationsService.error('Failed to load trainings');
    }
  }, [fetchError, notificationsService]);

  const refreshTrainings = async () => {
    await refetchTrainings();
  };

  const setTrainings = (updatedTrainings: Training[]) => {
    queryClient.setQueryData(trainingsQueryKey, updatedTrainings);
  };

  const error = fetchError
    ? getErrorMessage(fetchError, 'Failed to load trainings')
    : null;

  // Mark component as mounted after first render
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshTrainings();
  }, [refreshTrainings]);

  // Register refresh function with context
  useEffect(() => {
    if (!onRefreshRegister) {
      return;
    }

    // Register the async refresh function
    onRefreshRegister(refreshTrainings);

    // Cleanup on unmount
    return () => {
      onRefreshRegister(null);
    };
  }, [refreshTrainings, onRefreshRegister]);

  // Listen for training status updates via websocket
  useEffect(() => {
    const processingTrainings = trainings.filter(
      (t: ITraining) => t.status === TrainingStatus.PROCESSING,
    );

    const unsubscribers = processingTrainings.map((training: ITraining) => {
      const eventPath = `/trainings/${training.id}/status`;

      return subscribe(eventPath, (data: TrainingStatusUpdate) => {
        const { status, trainingId, progress } = data;

        setTrainings(
          trainings.map((t: ITraining) =>
            t.id === trainingId ? { ...t, status, ...progress } : t,
          ),
        );

        // Show notification
        if (status === TrainingStatus.COMPLETED) {
          notificationsService.success(
            `Training "${training.label}" completed successfully!`,
          );
        } else if (status === TrainingStatus.FAILED) {
          notificationsService.error(`Training "${training.label}" failed`);
        }
      });
    });

    return () => {
      unsubscribers.forEach((unsub: () => void) => unsub());
    };
  }, [trainings, subscribe, notificationsService, setTrainings]);

  const handleToggleActive = useCallback(
    async (training: ITraining) => {
      const newValue = training.isActive === false;

      try {
        const service = await getTrainingsService();
        await service.patch(training.id, {
          isActive: newValue,
        });

        notificationsService.success(
          `Training ${newValue ? 'activated' : 'deactivated'}`,
        );

        await handleRefresh();
      } catch (error) {
        const errorMessage = getErrorMessage(
          error,
          'Failed to update training status',
        );
        notificationsService.error(errorMessage);
      }
    },
    [getTrainingsService, notificationsService, handleRefresh],
  );

  const handleDelete = useCallback(
    async (training: ITraining) => {
      try {
        const service = await getTrainingsService();
        await service.delete(training.id);

        notificationsService.success('Training deleted successfully');

        await handleRefresh();
      } catch (error) {
        const errorMessage = getErrorMessage(
          error,
          'Failed to delete training',
        );
        notificationsService.error(errorMessage);
      }
    },
    [getTrainingsService, notificationsService, handleRefresh],
  );

  const openDeleteConfirmation = useCallback(
    (training: ITraining) => {
      openConfirm({
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Training',
        message: `Are you sure you want to delete "${training.label || training.id}"? This action cannot be undone.`,
        onConfirm: () => handleDelete(training),
      });
    },
    [openConfirm, handleDelete],
  );

  const openTrainingModal = useCallback((training: ITraining) => {
    setSelectedTraining(new Training(training));
    openModal(ModalEnum.TRAINING_EDIT);
  }, []);

  // Memoize columns to prevent unnecessary re-renders
  const columns = useMemo(
    () =>
      buildTrainingsTableColumns({
        scope,
        onToggleActive: handleToggleActive,
      }),
    [scope, handleToggleActive],
  );

  // Memoize actions to prevent unnecessary re-renders
  const actions = useMemo(
    () =>
      buildTrainingsTableActions({
        onEdit: openTrainingModal,
        onView: (training: ITraining) =>
          router.push(`/trainings/${training.id}`),
        onDelete: openDeleteConfirmation,
      }),
    [openTrainingModal, openDeleteConfirmation, router],
  );

  if (error) {
    return (
      <TrainingsErrorState error={error} onRetry={() => handleRefresh()} />
    );
  }

  const adminFilterNode =
    scope === PageScope.SUPERADMIN ? (
      <div className="mb-4">
        <AdminOrgBrandFilter
          organization={adminOrg}
          brand={adminBrand}
          onOrganizationChange={handleAdminOrgChange}
          onBrandChange={handleAdminBrandChange}
        />
      </div>
    ) : null;

  const tableContent = (
    <>
      {adminFilterNode}
      <AppTable<ITraining>
        items={trainings}
        columns={columns}
        actions={actions}
        getRowKey={(training) => training.id}
        isLoading={isLoading}
        emptyLabel="No trainings found"
        emptyState={
          scope !== PageScope.SUPERADMIN ? (
            <CardEmpty
              icon={HiOutlineCpuChip}
              label="No trainings yet"
              description="Train a custom AI model on your brand assets to generate on-brand content."
              action={{
                label: 'Create Training',
                onClick: () => openModal(ModalEnum.TRAINING_UPLOAD),
              }}
            />
          ) : undefined
        }
      />

      {/* Only render modals when not hiding container (layout handles modals when hideContainer=true) */}
      {!hideContainer && (
        <>
          <LazyModalTraining
            training={selectedTraining}
            onSuccess={() => handleRefresh()}
          />

          <LazyModalTrainingNew onSuccess={() => handleRefresh()} />
        </>
      )}
    </>
  );

  if (hideContainer) {
    return tableContent;
  }

  return (
    <Container
      label="Trainings"
      description="Create and manage model trainings."
      icon={HiOutlineCpuChip}
      right={
        <>
          <ButtonRefresh
            onClick={() => handleRefresh()}
            isRefreshing={isRefreshing}
          />

          {scope !== PageScope.SUPERADMIN && (
            <div className="flex items-center gap-4">
              <Button
                label="Training"
                icon={<HiPlus />}
                variant={ButtonVariant.DEFAULT}
                onClick={() => openModal(ModalEnum.TRAINING_UPLOAD)}
              />
            </div>
          )}
        </>
      }
    >
      {tableContent}
    </Container>
  );
}
