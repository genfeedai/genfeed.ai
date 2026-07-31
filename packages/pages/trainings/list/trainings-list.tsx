'use client';

import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { ITraining } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { ContentProps } from '@props/layout/content.props';
import { EmptyState } from '@ui/card/EmptyState';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalTraining } from '@ui/lazy/modal/LazyModal';
import { Cpu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import TrainingsErrorState from './components/TrainingsErrorState';
import { buildTrainingsTableActions } from './components/TrainingsTableActions';
import { buildTrainingsTableColumns } from './components/TrainingsTableColumns';
import { useTrainingsList } from './useTrainingsList';

/**
 * Trainings list body — table, filters, empty state, edit modal.
 * Page chrome (title, refresh, create CTA) lives on the route shell
 * (Models settings layout, admin trainings page), same as ModelsList.
 */
export default function TrainingsList({
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
}: ContentProps & {
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
}) {
  const router = useRouter();

  const {
    trainings,
    isLoading,
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
  } = useTrainingsList({ scope, onRefreshRegister });

  const columns = useMemo(
    () =>
      buildTrainingsTableColumns({
        scope,
        onToggleActive: handleToggleActive,
      }),
    [scope, handleToggleActive],
  );

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

  return (
    <>
      {scope === PageScope.SUPERADMIN ? (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      ) : null}

      <AppTable<ITraining>
        items={trainings}
        columns={columns}
        actions={actions}
        getRowKey={(training) => training.id}
        isLoading={isLoading}
        emptyLabel="No trainings found"
        emptyState={
          scope !== PageScope.SUPERADMIN ? (
            <EmptyState
              title="No trainings yet"
              description="Train a custom AI model on your brand assets to generate on-brand content."
              icon={Cpu}
              action={{
                label: 'Create Training',
                onClick: () => openModal(ModalEnum.TRAINING_UPLOAD),
              }}
            />
          ) : undefined
        }
      />

      <LazyModalTraining
        training={selectedTraining}
        onSuccess={() => handleRefresh()}
      />
    </>
  );
}
