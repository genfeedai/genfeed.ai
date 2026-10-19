import { ModalEnum, PageScope, TrainingStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { ITraining } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Training } from '@models/ai/training.model';
import type { ContentProps } from '@props/layout/content.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TrainingStatusUpdate = {
  status: Training['status'];
  trainingId: string;
  progress?: Partial<Training>;
};

type UseTrainingsListParams = ContentProps & {
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
};

export function useTrainingsList({
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
}: UseTrainingsListParams) {
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useCollectionScope();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const { subscribe } = useSocketManager();

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const [selectedTraining, setSelectedTraining] = useState<Training | null>(
    null,
  );

  // Admin org/brand filter (superadmin only) lives in the page subbar and is
  // stored in the URL; the list only reads it.
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  // Track if component is mounted to avoid calling callbacks during initial render
  const isMountedRef = useRef(false);

  const queryClient = useQueryClient();

  const trainingsQueryKey = useMemo(
    () =>
      [
        'trainings-list',
        scope,
        brandId,
        adminOrg,
        adminBrand,
        currentPage,
      ] as const,
    [adminBrand, adminOrg, brandId, currentPage, scope],
  );

  const {
    data: trainings = [] as Training[],
    isLoading,
    isFetching,
    refetch: refetchTrainings,
    error: fetchError,
  } = useQuery<Training[]>({
    enabled: !!isSignedIn,
    queryFn: async ({ signal }) => {
      const service = await getTrainingsService();

      const query: Record<string, unknown> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      if (scope === PageScope.BRAND && brandId) {
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

      const data = await service.findAll(query, signal);
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

  const refreshTrainings = useCallback(async () => {
    await refetchTrainings();
  }, [refetchTrainings]);

  const setTrainings = useCallback(
    (updatedTrainings: Training[]) => {
      queryClient.setQueryData(trainingsQueryKey, updatedTrainings);
    },
    [queryClient, trainingsQueryKey],
  );

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
      unsubscribers.forEach((unsub: () => void) => {
        unsub();
      });
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

  return {
    trainings,
    isLoading,
    isRefreshing,
    error,
    selectedTraining,
    adminOrg,
    adminBrand,
    handleRefresh,
    handleToggleActive,
    openTrainingModal,
    openDeleteConfirmation,
  };
}
