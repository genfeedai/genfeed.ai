'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { NavigationTab } from '@genfeedai/interfaces/ui/navigation.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { LazyModalTrainingNew } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { HiCpuChip, HiPlus } from 'react-icons/hi2';

export default function ModelsLayoutContent({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { orgHref } = useOrgUrl();

  const { refreshTrainings, isRefreshing: isRefreshingTrainings } =
    useTrainingsContext();
  const { refreshModels, isRefreshing: isRefreshingModels } =
    useModelsContext();

  const tabs: NavigationTab[] = useMemo(
    () => [
      {
        href: orgHref('/settings/models/all'),
        id: 'all',
        label: 'All',
      },
      {
        href: orgHref('/settings/models/images'),
        id: 'images',
        label: 'Images',
      },
      {
        href: orgHref('/settings/models/videos'),
        id: 'videos',
        label: 'Videos',
      },
      {
        href: orgHref('/settings/models/text'),
        id: 'text',
        label: 'Text',
      },
      {
        href: orgHref('/settings/models/trainings'),
        id: 'trainings',
        label: 'Trainings',
      },
    ],
    [orgHref],
  );

  // Determine active tab based on pathname
  const activeTab = useMemo(() => {
    if (pathname?.includes('/trainings')) {
      return 'trainings';
    }
    if (pathname?.includes('/text')) {
      return 'text';
    }
    if (pathname?.includes('/videos')) {
      return 'videos';
    }
    if (pathname?.includes('/images')) {
      return 'images';
    }
    return 'all';
  }, [pathname]);

  const isTrainingsTab = activeTab === 'trainings';
  const isRefreshing = isTrainingsTab
    ? isRefreshingTrainings
    : isRefreshingModels;

  const handleRefresh = useCallback(() => {
    if (isTrainingsTab) {
      refreshTrainings?.();
    } else {
      refreshModels?.();
    }
  }, [isTrainingsTab, refreshTrainings, refreshModels]);

  return (
    <Container
      label="Models"
      description="Manage available AI models."
      icon={HiCpuChip}
      tabs={tabs.map((tab) => ({
        href: tab.href,
        label: tab.label,
      }))}
      right={
        <div className="flex items-center gap-2">
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />

          {isTrainingsTab && (
            <Button
              label="Training"
              icon={<HiPlus />}
              variant={ButtonVariant.DEFAULT}
              onClick={() => openModal(ModalEnum.TRAINING_UPLOAD)}
            />
          )}
        </div>
      }
    >
      {children}

      {isTrainingsTab && <LazyModalTrainingNew />}
    </Container>
  );
}
