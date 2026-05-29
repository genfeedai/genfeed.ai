'use client';

import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
import type { ITraining } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { ContentProps } from '@props/layout/content.props';
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
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { HiOutlineCpuChip, HiPlus } from 'react-icons/hi2';
import TrainingsErrorState from './components/TrainingsErrorState';
import { buildTrainingsTableActions } from './components/TrainingsTableActions';
import { buildTrainingsTableColumns } from './components/TrainingsTableColumns';
import { useTrainingsList } from './useTrainingsList';

export default function TrainingsList({
  scope = PageScope.ORGANIZATION,
  hideContainer = false,
  onRefreshRegister,
}: ContentProps & {
  hideContainer?: boolean;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
}) {
  const router = useRouter();

  const {
    trainings,
    isLoading,
    isRefreshing,
    error,
    selectedTraining,
    adminOrg,
    adminBrand,
    handleRefresh,
    handleAdminOrgChange,
    handleAdminBrandChange,
    handleToggleActive,
    openTrainingModal,
    openDeleteConfirmation,
  } = useTrainingsList({ scope, hideContainer, onRefreshRegister });

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
