'use client';

import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant, IngredientCategory, ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import ElementsProvider from '@providers/elements/elements.provider';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ELEMENT_LABELS } from '@ui-constants/element.constant';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineTag, HiPlus } from 'react-icons/hi2';

export default function ElementsLayout({ children }: LayoutProps) {
  const pathname = usePathname();

  const [filters, setFilters] = useState<IFiltersState>({
    format: '',
    provider: '',
    search: '',
    status: '',
    type: '',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const elementType = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1];
  }, [pathname]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  const filterConfig = useMemo(() => {
    switch (elementType) {
      case 'blacklists':
        return {
          addButtonLabel: 'Blacklist',
          filterOptions: {
            type: [
              { label: 'Video', value: IngredientCategory.VIDEO },
              { label: 'Image', value: IngredientCategory.IMAGE },
              { label: 'Text/Voice', value: IngredientCategory.VOICE },
              { label: 'Music', value: IngredientCategory.MUSIC },
            ],
          },
          modalId: ModalEnum.BLACKLIST,
          visibleFilters: { search: true, type: true },
        };
      case 'cameras':
        return {
          addButtonLabel: 'Camera',
          filterOptions: {},
          modalId: ModalEnum.CAMERA,
          visibleFilters: { search: true },
        };
      case 'lenses':
        return {
          addButtonLabel: 'Lens',
          filterOptions: {},
          modalId: ModalEnum.LENS,
          visibleFilters: { search: true },
        };
      case 'lightings':
        return {
          addButtonLabel: 'Lighting',
          filterOptions: {},
          modalId: ModalEnum.LIGHTING,
          visibleFilters: { search: true },
        };
      case 'camera-movements':
        return {
          addButtonLabel: 'Camera Movement',
          filterOptions: {},
          modalId: ModalEnum.CAMERA_MOVEMENT,
          visibleFilters: { search: true },
        };
      case 'moods':
        return {
          addButtonLabel: 'Mood',
          filterOptions: {},
          modalId: ModalEnum.MOOD,
          visibleFilters: { search: true },
        };
      case 'scenes':
        return {
          addButtonLabel: 'Scene',
          filterOptions: {},
          modalId: ModalEnum.SCENE,
          visibleFilters: { search: true },
        };
      case 'styles':
        return {
          addButtonLabel: 'Style',
          filterOptions: {},
          modalId: ModalEnum.STYLE,
          visibleFilters: { search: true },
        };
      case 'sounds':
        return {
          addButtonLabel: 'Sound',
          filterOptions: {
            type: [
              { label: 'Video', value: IngredientCategory.VIDEO },
              { label: 'Image', value: IngredientCategory.IMAGE },
              { label: 'Voice', value: IngredientCategory.VOICE },
              { label: 'Music', value: IngredientCategory.MUSIC },
            ],
          },
          modalId: ModalEnum.SOUND,
          visibleFilters: { search: true, type: true },
        };
      default:
        return {
          addButtonLabel: null,
          filterOptions: {},
          modalId: null,
          visibleFilters: { search: true },
        };
    }
  }, [elementType]);

  const currentElement = ELEMENT_LABELS[elementType] || {
    description: 'Manage platform elements',
    label: 'Elements',
  };

  return (
    <ElementsProvider>
      <Container
        label={currentElement.label}
        description={currentElement.description}
        icon={HiOutlineTag}
        tabs={Object.keys(ELEMENT_LABELS)
          .filter((type) => type !== 'font-families')
          .map((type) => ({
            href: `/configuration/elements/${type}`,
            label: ELEMENT_LABELS[type].label,
          }))}
        right={
          <div className="flex items-center gap-2">
            <FiltersButton
              filters={filters}
              visibleFilters={filterConfig.visibleFilters}
              filterOptions={filterConfig.filterOptions}
              onFiltersChange={(f: IFiltersState) => {
                setFilters(f);
              }}
            />

            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />

            {filterConfig.addButtonLabel && (
              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={() => {
                  openModal(filterConfig.modalId!);
                }}
              >
                <HiPlus />
                {filterConfig.addButtonLabel}
              </Button>
            )}
          </div>
        }
      >
        {children}
      </Container>
    </ElementsProvider>
  );
}
