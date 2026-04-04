'use client';

import { useAuth } from '@clerk/nextjs';
import type {
  IBrand,
  IOrganization,
  ITraining,
  IUser,
} from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, ModalEnum, TrainingStatus } from '@genfeedai/enums';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Training } from '@models/ai/training.model';
import type { ContentProps } from '@props/layout/content.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TrainingsService } from '@services/ai/trainings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import Container from '@ui/layout/container/Container';
import {
  LazyModalTraining,
  LazyModalTrainingNew,
} from '@ui/lazy/modal/LazyModal';
import { PageScope } from '@ui-constants/misc.constant';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiEye,
  HiOutlineCpuChip,
  HiPencil,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';

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

  // Load trainings using useResource (handles AbortController cleanup properly)
  const {
    data: trainings,
    isLoading,
    isRefreshing,
    error: fetchError,
    refresh: refreshTrainings,
    mutate: setTrainings,
  } = useResource(
    async () => {
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
    {
      defaultValue: [] as Training[],
      dependencies: [scope, brandId, adminOrg, adminBrand],
      enabled: !!isSignedIn,
      onError: (error: Error) => {
        logger.error('GET /trainings failed', error);
        notificationsService.error('Failed to load trainings');
      },
    },
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
      (t) => t.status === TrainingStatus.PROCESSING,
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
      unsubscribers.forEach((unsub) => unsub());
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
  const columns: TableColumn<ITraining>[] = useMemo(() => {
    const baseColumns: TableColumn<ITraining>[] = [
      {
        header: 'Name',
        key: 'label',
        render: (training) => (
          <div>
            <div className="font-semibold text-foreground">
              {training.label}
            </div>
            {training.externalId && (
              <div className="text-xs text-muted-foreground">
                {training.externalId}
              </div>
            )}
          </div>
        ),
      },
      {
        header: 'Trigger Word',
        key: 'trigger_word',
        render: (training: ITraining) => (
          <code className="bg-muted px-2 py-1 text-sm dark:bg-muted">
            {training.trigger}
          </code>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (training: ITraining) => <Badge status={training.status} />,
      },
      {
        className: 'text-center',
        header: 'Steps',
        key: 'steps',
        render: (training: ITraining) => (
          <span className="text-center">
            {formatNumberWithCommas(training.steps || 0)}
          </span>
        ),
      },
      {
        className: 'text-center',
        header: 'Sources',
        key: 'totalSources',
        render: (training: ITraining) => (
          <span className="text-center">{training.totalSources || 0}</span>
        ),
      },
      {
        className: 'text-center',
        header: 'Generated',
        key: 'totalGeneratedImages',
        render: (training: ITraining) => (
          <span className="text-center">
            {training.totalGeneratedImages || 0}
          </span>
        ),
      },
      {
        header: 'Active',
        key: 'isActive',
        render: (training: ITraining) => (
          <FormToggle
            isChecked={training.isActive !== false}
            onChange={() => handleToggleActive(training)}
          />
        ),
      },
    ];

    // Add owner column for admin app
    if (scope === PageScope.SUPERADMIN) {
      baseColumns.splice(1, 0, {
        header: 'Owner',
        key: 'owner',
        render: (training: ITraining) => (
          <div className="text-sm">
            {training.organization && (
              <div className="text-foreground/80">
                {(training?.organization as IOrganization).label}
              </div>
            )}
            {training.brand && (
              <div className="text-muted-foreground">
                {(training?.brand as IBrand).label}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {(training?.user as IUser).fullName}
            </div>
          </div>
        ),
      });
    }

    return baseColumns;
  }, [scope, handleToggleActive]);

  // Memoize actions to prevent unnecessary re-renders
  const actions: TableAction<ITraining>[] = useMemo(
    () => [
      {
        icon: () => <HiPencil />,
        onClick: (training: ITraining) => {
          openTrainingModal(training);
        },
        tooltip: 'Edit',
      },
      {
        icon: () => <HiEye />,
        onClick: (training: ITraining) =>
          router.push(`/trainings/${training.id}`),
        tooltip: 'Details',
      },
      {
        className: 'text-error hover:text-error',
        icon: () => <HiTrash />,
        onClick: (training: ITraining) => {
          openDeleteConfirmation(training);
        },
        tooltip: 'Delete',
      },
    ],
    [openTrainingModal, openDeleteConfirmation, router],
  );

  if (error) {
    return (
      <div className="container mx-auto flex min-h-56 items-center justify-center px-4 py-8">
        <Card className="p-12 w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
            <span className="text-2xl">!</span>
          </div>

          <h3 className="mb-2 text-lg font-semibold text-foreground">
            Failed to load trainings
          </h3>

          <p className="mb-4 text-muted-foreground">{error}</p>

          <div className="flex justify-center">
            <Button
              label="Try Again"
              onClick={() => handleRefresh()}
              className="mt-4"
            />
          </div>
        </Card>
      </div>
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
