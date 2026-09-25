import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { hasTrainingAccess } from '@genfeedai/pricing';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
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
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback } from 'react';

const MODEL_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'text', label: 'Text' },
  { value: 'trainings', label: 'Trainings' },
] as const;

type ModelTypeValue = (typeof MODEL_TYPE_OPTIONS)[number]['value'];

export default function ModelsLayoutContent({
  children,
}: {
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const router = useRouter();
  const { orgHref } = useOrgUrl();
  const { settings } = useBrand();
  const canTrain =
    isSelfHostedDeployment() || hasTrainingAccess(settings?.subscriptionTier);

  const { refreshTrainings, isRefreshing: isRefreshingTrainings } =
    useTrainingsContext();
  const { refreshModels, isRefreshing: isRefreshingModels } =
    useModelsContext();

  const activeType: ModelTypeValue =
    MODEL_TYPE_OPTIONS.find(
      (option) => option.value === searchParams?.get('type'),
    )?.value ?? 'all';

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
      router.push(
        createFilterHref(orgHref('/settings/models'), search, 'type', value),
        { scroll: false },
      );
    },
    [activeType, orgHref, router, search],
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
