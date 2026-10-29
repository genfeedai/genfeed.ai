import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useModelsToolbar } from '@contexts/models/models-toolbar-context/models-toolbar-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { hasTrainingAccess } from '@genfeedai/pricing';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { openModal } from '@helpers/ui/modal/modal.helper';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import Container from '@ui/layout/container/Container';
import { LazyModalTrainingNew } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback } from 'react';

// The Filters menu switches between the catalog, the organization's trainings
// and its managed custom models, and carries the catalog's category filter.
const MODEL_TYPE_OPTIONS = [
  { value: 'all', label: 'Catalog' },
  { value: 'trainings', label: 'Trainings' },
  { value: 'custom-models', label: null },
] as const;

type ModelTypeValue = (typeof MODEL_TYPE_OPTIONS)[number]['value'];

export default function ModelsLayoutContent({
  children,
}: {
  children: ReactNode;
}) {
  const translateCustomModels = useTranslations(
    'common.settings.organizationCustomModels',
  );
  const translateFilters = useTranslations('pages.models');
  const pathname = usePathname();
  const router = useRouter();
  const { orgHref } = useOrgUrl();
  const { settings } = useBrand();
  const toolbar = useModelsToolbar();
  const canTrain =
    isSelfHostedDeployment() || hasTrainingAccess(settings?.subscriptionTier);

  const { refreshTrainings, isRefreshing: isRefreshingTrainings } =
    useTrainingsContext();
  const { refreshModels, isRefreshing: isRefreshingModels } =
    useModelsContext();

  // The path names the view: /settings/models is the catalog, the others are
  // /settings/models/<type>.
  const activeSegment = pathname?.split('/').filter(Boolean).pop();
  const activeType: ModelTypeValue =
    MODEL_TYPE_OPTIONS.find((option) => option.value === activeSegment)
      ?.value ?? 'all';

  const isTrainingsTab = activeType === 'trainings';
  const isCustomModelsTab = activeType === 'custom-models';
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
        orgHref(
          value === 'all' ? '/settings/models' : `/settings/models/${value}`,
        ),
        { scroll: false },
      );
    },
    [activeType, orgHref, router],
  );

  const typeFacet: FilterMenuFacet = {
    defaultValue: 'all',
    isCounted: false,
    key: 'type',
    label: translateFilters('modelType'),
    onChange: handleTypeChange,
    options: MODEL_TYPE_OPTIONS.map((option) => ({
      label: option.label ?? translateCustomModels('title'),
      value: option.value,
    })),
    selection: 'single',
    value: activeType,
  };
  const facets: FilterMenuFacet[] = [
    typeFacet,
    ...(activeType === 'all' ? (toolbar?.facets ?? []) : []),
  ];

  const clearFilters = () => {
    toolbar?.onClear();
  };
  // The catalog has a search, so its Filters menu sits inside that field. The
  // other views have none, so the menu stands alone.
  const hasSearch = activeType === 'all' && toolbar != null;

  return (
    <Container
      label="Models"
      icon={Cpu}
      leading={
        hasSearch ? (
          <SearchField
            onSearch={toolbar.search.onSearch}
            placeholder={toolbar.search.placeholder}
            value={toolbar.search.value}
          >
            <FilterMenu facets={facets} isAttached onClear={clearFilters} />
          </SearchField>
        ) : undefined
      }
      refresh={
        isCustomModelsTab ? undefined : (
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
        )
      }
      right={
        <div
          data-testid="models-layout-actions"
          className="flex items-center gap-2"
        >
          {hasSearch ? null : (
            <FilterMenu facets={facets} onClear={clearFilters} />
          )}

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
