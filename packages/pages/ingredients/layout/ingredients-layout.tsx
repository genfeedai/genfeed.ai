'use client';

import type { IBrand, IFieldOption } from '@cloud/interfaces';
import type { IIngredientsContextValue } from '@cloud/interfaces/providers/providers.interface';
import type {
  IFilters,
  IFiltersState,
} from '@cloud/interfaces/utils/filters.interface';
import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IngredientsLayoutProps } from '@props/content/ingredients-layout.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiArrowUpTray,
  HiOutlinePhoto,
} from 'react-icons/hi2';

// Filter configurations for different ingredient types
const INGREDIENT_CONFIGS = {
  avatars: {
    filterOptions: {
      provider: [
        { label: 'All Providers', value: '' },
        { label: 'HeyGen', value: 'heygen' },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
      ],
    },
    showStudioLink: false,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: true,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  gifs: {
    filterOptions: {
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: false,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  images: {
    filterOptions: {
      format: [
        { label: 'All Formats', value: '' },
        { label: '16:9', value: IngredientFormat.LANDSCAPE },
        { label: '9:16', value: IngredientFormat.PORTRAIT },
        { label: '1:1', value: IngredientFormat.SQUARE },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: true,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  musics: {
    filterOptions: {
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
        { label: 'Longest First', value: 'duration: -1' },
        { label: 'Shortest First', value: 'duration: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  videos: {
    filterOptions: {
      format: [
        { label: 'All Formats', value: '' },
        { label: '16:9', value: IngredientFormat.LANDSCAPE },
        { label: '9:16', value: IngredientFormat.PORTRAIT },
        { label: '1:1', value: IngredientFormat.SQUARE },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
        { label: 'Longest First', value: 'duration: -1' },
        { label: 'Shortest First', value: 'duration: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: true,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  voices: {
    filterOptions: {
      provider: [
        { label: 'All Providers', value: '' },
        { label: 'HeyGen', value: 'heygen' },
        { label: 'ElevenLabs', value: 'elevenlabs' },
        { label: 'Genfeed', value: 'genfeed-ai' },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },

        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: false,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: true,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
};

export default function IngredientsLayout({
  children,
  scope = PageScope.BRAND,
  defaultType,
  hideTypeTabs,
}: IngredientsLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brands, brandId } = useBrand();
  const { openUpload } = useUploadModal();

  // Initialize filters from URL query params on mount only
  const getInitialState = useCallback(() => {
    // Read initial values directly from searchParams
    const statusParams = searchParams?.getAll('status') ?? [];
    const formatParam = searchParams?.get('format');
    const typeParam = searchParams?.get('type');
    const providerParam = searchParams?.get('provider');
    const sortParam = searchParams?.get('sort');
    const searchParam = searchParams?.get('search');
    const brandParam = searchParams?.get('brand');

    // Determine ingredient type from pathname for default format
    let _ingredientCategory: string | null = null;
    if (pathname) {
      const segments = pathname.split('/');
      const ingredientsIndex = segments.indexOf('ingredients');
      if (ingredientsIndex !== -1 && segments[ingredientsIndex + 1]) {
        _ingredientCategory = segments[ingredientsIndex + 1];
      }
    }

    // Default format to "all" (empty string) - don't force format filter
    const defaultFormat = formatParam || '';

    const initialIngredientType =
      defaultType ?? _ingredientCategory ?? 'videos';

    // Default status to completed, processing, validated for videos if not in URL.
    // Voices should load without implicit status narrowing.
    const defaultStatus =
      statusParams.length === 0
        ? initialIngredientType === 'voices'
          ? []
          : [
              IngredientStatus.GENERATED,
              IngredientStatus.PROCESSING,
              IngredientStatus.VALIDATED,
            ]
        : statusParams;

    const initialFilters: IFiltersState = {
      brand: brandParam || (scope === PageScope.ORGANIZATION ? brandId : ''), // Default to selectedBrandId in Dashboard
      favorite: '',
      format: defaultFormat || '',
      model: '',
      provider: providerParam || '',
      search: searchParam || '',
      sort: sortParam || '',
      status: defaultStatus,
      type: typeParam || '',
    };

    // Initialize query to match filters
    const initialQuery: IFilters = {};
    Object.entries(initialFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          initialQuery[key as keyof IFilters] = value;
        } else if (!Array.isArray(value)) {
          initialQuery[key as keyof IFilters] = value;
        }
      }
    });

    return { filters: initialFilters, query: initialQuery };
  }, [searchParams, scope, brandId, pathname, defaultType]);

  const [filters, setFilters] = useState<IFiltersState>(
    () => getInitialState().filters,
  );
  const [query, setQuery] = useState<IFilters>(() => getInitialState().query);
  const [ingredientType, setIngredientType] = useState(defaultType ?? 'videos');
  const [headerMeta, setHeaderMeta] = useState<ReactNode>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefreshCallbackRef = useRef<(() => void) | undefined>(undefined);

  const updateURLFromFilters = useCallback(
    (newFilters: IFiltersState) => {
      const params = new URLSearchParams();

      // Add filter params to URL
      if (newFilters.search) {
        params.set('search', newFilters.search);
      }
      if (newFilters.status) {
        if (Array.isArray(newFilters.status)) {
          for (const status of newFilters.status) {
            if (!status) {
              continue;
            }

            params.append('status', status);
          }
        } else if (newFilters.status) {
          params.set('status', newFilters.status);
        }
      }

      if (newFilters.format) {
        params.set('format', newFilters.format);
      }

      if (newFilters.type) {
        params.set('type', newFilters.type);
      }

      if (newFilters.provider) {
        params.set('provider', newFilters.provider);
      }

      if (newFilters.sort) {
        params.set('sort', newFilters.sort);
      }

      if (newFilters.brand) {
        params.set('brand', newFilters.brand);
      }

      // Preserve page param if it exists
      const pageParam = searchParams?.get('page');
      if (pageParam) {
        params.set('page', pageParam);
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      const currentSearch = window.location.search;

      // Only update URL if it's different to avoid unnecessary navigation
      const expectedSearch = queryString ? `?${queryString}` : '';
      if (currentSearch !== expectedSearch) {
        router.replace(newUrl, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const hasStatusInUrl = (searchParams?.getAll('status')?.length ?? 0) > 0;
    const statusDefaultApplied =
      !hasStatusInUrl &&
      Array.isArray(filters.status) &&
      filters.status.length > 0;

    if (statusDefaultApplied) {
      updateURLFromFilters(filters);
    }
  }, [filters, searchParams?.get, updateURLFromFilters]); // Only run on mount

  // Register refresh callback from child components
  const registerRefresh = useCallback((callback: () => void) => {
    onRefreshCallbackRef.current = callback;
  }, []);

  const handleRefresh = useCallback(() => {
    if (onRefreshCallbackRef.current) {
      onRefreshCallbackRef.current();
    }
  }, []);

  // Determine which ingredient type we're on — prefer state, fallback to URL
  const ingredientCategory = useMemo(() => {
    if (ingredientType) {
      return ingredientType;
    }

    if (!pathname) {
      return null;
    }

    const segments = pathname.split('/');
    const ingredientsIndex = segments.indexOf('ingredients');

    if (ingredientsIndex !== -1 && segments[ingredientsIndex + 1]) {
      return segments[ingredientsIndex + 1];
    }

    return null;
  }, [ingredientType, pathname]);

  // Ingredient type labels and descriptions
  const INGREDIENT_LABELS: Record<
    string,
    { label: string; description: string }
  > = {
    avatars: {
      description: 'Create and manage AI avatars for video presentations',
      label: 'Avatars',
    },
    gifs: {
      description: 'Browse and manage your animated GIF assets',
      label: 'GIFs',
    },
    images: {
      description:
        'Organize and enhance your image assets for content creation',
      label: 'Images',
    },
    musics: {
      description: 'Browse and manage your audio tracks and background music',
      label: 'Music',
    },
    videos: {
      description:
        'Manage your video library and create stunning visual content',
      label: 'Videos',
    },
    voices: {
      description: 'Access AI-generated voices and manage voice clones',
      label: 'Voices',
    },
  };

  const currentIngredient =
    ingredientCategory && INGREDIENT_LABELS[ingredientCategory]
      ? INGREDIENT_LABELS[ingredientCategory]
      : {
          description: 'Everything you need for your creations',
          label: 'Ingredients',
        };

  const config = useMemo(() => {
    const configKey = ingredientCategory as keyof typeof INGREDIENT_CONFIGS;
    const baseConfig =
      INGREDIENT_CONFIGS[configKey] ?? INGREDIENT_CONFIGS.videos;

    // Add brand filter only for organization scope (Dashboard)
    if (scope === PageScope.ORGANIZATION) {
      const brandOptions: IFieldOption[] = [
        { label: 'All Brands', value: '' },
        ...brands.map((brand: IBrand) => ({
          label: brand.label,
          value: brand.id,
        })),
      ];

      return {
        ...baseConfig,
        filterOptions: {
          ...baseConfig.filterOptions,
          account: brandOptions,
        },
        visibleFilters: {
          ...baseConfig.visibleFilters,
          account: true, // Show brand filter in Dashboard
        },
      };
    }

    // For brand scope (Manager), hide brand filter
    return {
      ...baseConfig,
      visibleFilters: {
        ...baseConfig.visibleFilters,
        account: false, // Hide brand filter in Manager
      },
    };
  }, [ingredientCategory, scope, brands]);

  // Context value
  const contextValue: IIngredientsContextValue = useMemo(
    () => ({
      filters,
      ingredientType,
      isRefreshing,
      onRefresh: registerRefresh,
      query,
      setFilters,
      setIngredientType,
      setIsRefreshing,
      setQuery,
    }),
    [filters, query, isRefreshing, registerRefresh, ingredientType],
  );

  const description = headerMeta ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{currentIngredient.description}</span>
      <span className="text-foreground/50" aria-hidden="true">
        •
      </span>
      <span className="text-foreground/70">{headerMeta}</span>
    </div>
  ) : (
    currentIngredient.description
  );

  return (
    <IngredientsHeaderProvider value={{ headerMeta, setHeaderMeta }}>
      <IngredientsProvider value={contextValue}>
        <Container
          label={currentIngredient.label}
          description={description}
          icon={HiOutlinePhoto}
          {...(hideTypeTabs
            ? {}
            : {
                activeTab: ingredientType,
                onTabChange: setIngredientType,
                tabs: [
                  { id: 'videos', label: 'Videos' },
                  { id: 'images', label: 'Images' },
                  { id: 'gifs', label: 'GIFs' },
                  { id: 'musics', label: 'Music' },
                ],
              })}
          right={
            <div className="flex items-center gap-2">
              <ButtonRefresh
                onClick={handleRefresh}
                isRefreshing={isRefreshing}
              />

              <FiltersButton
                filters={filters}
                visibleFilters={config.visibleFilters}
                filterOptions={config.filterOptions}
                onFiltersChange={(f: IFiltersState, q: IFilters) => {
                  setFilters(f);
                  setQuery((prevQuery) => ({ ...prevQuery, ...q }));
                  updateURLFromFilters(f);
                }}
              />

              {scope !== PageScope.SUPERADMIN && config.showUpload && (
                <Button
                  tooltip="Upload"
                  icon={<HiArrowUpTray />}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    if (!ingredientCategory) {
                      return;
                    }
                    const singularType = ingredientCategory.slice(0, -1);
                    openUpload({
                      category: singularType,
                      onConfirm: () => handleRefresh(),
                      parentId: brandId,
                      parentModel: 'Brand',
                    });
                  }}
                />
              )}

              {scope !== PageScope.SUPERADMIN && config.showStudioLink && (
                <AppLink
                  url={`${EnvironmentService.apps.app}/studio/${ingredientCategory?.replace('s', '')?.toLowerCase()}`}
                  icon={<HiArrowTopRightOnSquare />}
                  label="Studio"
                  variant={ButtonVariant.DEFAULT}
                  target="_blank"
                />
              )}
            </div>
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
