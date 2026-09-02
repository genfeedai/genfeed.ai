'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { hasTrainingAccess } from '@genfeedai/pricing';
import { openModal } from '@helpers/ui/modal/modal.helper';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { LazyModalTrainingNew } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Cpu, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';

const MODEL_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'text', label: 'Text' },
  { value: 'trainings', label: 'Trainings' },
] as const;

type ModelTypeValue = (typeof MODEL_TYPE_OPTIONS)[number]['value'];

function resolveModelType(pathname: string | null): ModelTypeValue {
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
}

export default function ModelsLayoutContent({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { orgHref } = useOrgUrl();
  const { settings } = useBrand();
  const canTrain =
    isSelfHostedDeployment() || hasTrainingAccess(settings?.subscriptionTier);

  const { refreshTrainings, isRefreshing: isRefreshingTrainings } =
    useTrainingsContext();
  const { refreshModels, isRefreshing: isRefreshingModels } =
    useModelsContext();

  const activeType = useMemo(() => resolveModelType(pathname), [pathname]);

  const isTrainingsTab = activeType === 'trainings';
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

  const handleTypeChange = useCallback(
    (value: string) => {
      if (!MODEL_TYPE_OPTIONS.some((option) => option.value === value)) {
        return;
      }
      if (value === activeType) {
        return;
      }
      router.push(orgHref(`/settings/models/${value}`));
    },
    [activeType, orgHref, router],
  );

  return (
    <Container
      label="Models"
      description="Manage available AI models."
      icon={Cpu}
      right={
        <div
          data-testid="models-layout-actions"
          className="flex items-center gap-2"
        >
          <Select value={activeType} onValueChange={handleTypeChange}>
            <SelectTrigger
              id="models-type-filter"
              className="h-8 w-36 shrink-0"
              aria-label="Model type"
            >
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />

          {isTrainingsTab && canTrain ? (
            <Button
              label="Training"
              icon={<Plus />}
              variant={ButtonVariant.DEFAULT}
              onClick={() => openModal(ModalEnum.TRAINING_UPLOAD)}
            />
          ) : null}
        </div>
      }
    >
      {children}

      {isTrainingsTab && canTrain ? <LazyModalTrainingNew /> : null}
    </Container>
  );
}
