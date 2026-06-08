import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientStatus, PageScope } from '@genfeedai/enums';
import type { IBrand, IFieldOption } from '@genfeedai/interfaces';
import type { IIngredientsContextValue } from '@genfeedai/interfaces/providers/providers.interface';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import type { IngredientsLayoutProps } from '@props/content/ingredients-layout.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INGREDIENT_CONFIGS,
  INGREDIENT_LABELS,
} from './ingredients-layout.config';

export function useIngredientsLayout({
  scope = PageScope.BRAND,
  defaultType,
}: Pick<IngredientsLayoutProps, 'scope' | 'defaultType'>) {
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
  }, [filters, updateURLFromFilters, searchParams?.getAll]); // Only run on mount

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

  const handleFiltersChange = useCallback(
    (f: IFiltersState, q: IFilters) => {
      setFilters(f);
      setQuery((prevQuery) => ({ ...prevQuery, ...q }));
      updateURLFromFilters(f);
    },
    [updateURLFromFilters],
  );

  const handleUpload = useCallback(() => {
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
  }, [ingredientCategory, openUpload, brandId, handleRefresh]);

  return {
    brandId,
    config,
    contextValue,
    currentIngredient,
    filters,
    handleFiltersChange,
    handleRefresh,
    handleUpload,
    headerMeta,
    ingredientCategory,
    ingredientType,
    isRefreshing,
    setHeaderMeta,
    setIngredientType,
  };
}
