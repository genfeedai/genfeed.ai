'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ITraining } from '@genfeedai/contracts/interfaces';
import { hasTrainingAccess } from '@genfeedai/pricing';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentProps } from '@props/layout/content.props';
import { EmptyState } from '@ui/card/EmptyState';
import CardEmpty from '@ui/card/empty/CardEmpty';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalTraining } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Cpu, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import TrainingsErrorState from './components/TrainingsErrorState';
import { buildTrainingsTableActions } from './components/TrainingsTableActions';
import { buildTrainingsTableColumns } from './components/TrainingsTableColumns';
import { useTrainingsList } from './useTrainingsList';

const TRAINING_UPGRADE_TIER_LABEL = 'Pro';

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
  const { orgHref } = useOrgUrl();
  const { isReady, settings } = useBrand();
  const selfHostedDeployment = isSelfHostedDeployment();
  const canTrain =
    scope === PageScope.SUPERADMIN ||
    selfHostedDeployment ||
    hasTrainingAccess(settings?.subscriptionTier);

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
  } = useTrainingsList({
    // Skip list fetch on locked free cloud tiers.
    scope,
    onRefreshRegister: canTrain ? onRefreshRegister : undefined,
  });

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

  if (isReady && scope !== PageScope.SUPERADMIN && !canTrain) {
    return (
      <CardEmpty
        actions={
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
              Upgrade to {TRAINING_UPGRADE_TIER_LABEL}
            </Link>
          </Button>
        }
        description={`Custom model training is included on paid plans. Upgrade to ${TRAINING_UPGRADE_TIER_LABEL} to train brand models on your assets.`}
        icon={Lock}
        label={`Unlock trainings with ${TRAINING_UPGRADE_TIER_LABEL}`}
      />
    );
  }

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
