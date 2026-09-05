'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IFilters } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import type { FiltersBarProps } from '@genfeedai/props/ui/forms/filters.props';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import {
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

// Default filter options
const DEFAULT_STATUS_OPTIONS = [
  { label: 'Uploaded', value: IngredientStatus.UPLOADED },
  { label: 'Completed', value: IngredientStatus.GENERATED },
  { label: 'Validated', value: IngredientStatus.VALIDATED },
  { label: 'Archived', value: IngredientStatus.ARCHIVED },
  { label: 'Draft', value: IngredientStatus.DRAFT },
  { label: 'Processing', value: IngredientStatus.PROCESSING },
  { label: 'Failed', value: IngredientStatus.FAILED },
];

const DEFAULT_FORMAT_OPTIONS = [
  { label: 'All Formats', value: '' },
  {
    icon: <Square className={SHELL_ICON_CLASS} aria-hidden="true" />,
    label: '1:1',
    value: IngredientFormat.SQUARE,
  },
  {
    icon: (
      <RectangleHorizontal className={SHELL_ICON_CLASS} aria-hidden="true" />
    ),
    label: '16:9',
    value: IngredientFormat.LANDSCAPE,
  },
  {
    icon: <RectangleVertical className={SHELL_ICON_CLASS} aria-hidden="true" />,
    label: '9:16',
    value: IngredientFormat.PORTRAIT,
  },
];

const DEFAULT_TYPE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Audio', value: 'audio' },
  { label: 'Clip', value: 'clip' },
  { label: 'Avatar', value: 'avatar' },
  { label: 'Voice', value: 'voice' },
  { label: 'Music', value: 'music' },
  { label: 'GIF', value: 'gif' },
  { label: 'Image to Video', value: 'image-to-video' },
];

const DEFAULT_SORT_OPTIONS = [
  { label: 'Latest (Default)', value: '' },
  { label: 'Newest First', value: 'createdAt: -1' },
  { label: 'Oldest First', value: 'createdAt: 1' },
  { label: 'Name (A-Z)', value: 'label: 1' },
  { label: 'Name (Z-A)', value: 'label: -1' },
  { label: 'Recently Updated', value: 'updatedAt: -1' },
];

const DEFAULT_FAVORITE_OPTIONS = [
  { label: 'All Items', value: '' },
  { label: 'Favorites Only', value: 'true' },
  { label: 'Non-Favorites', value: 'false' },
];

const DEFAULT_PROVIDER_OPTIONS = [
  { label: 'All Providers', value: '' },
  { label: 'Runway', value: 'runway' },
  { label: 'Leonardo', value: 'leonardo' },
  { label: 'ElevenLabs', value: 'elevenlabs' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
  { label: 'Stability AI', value: 'stability' },
  { label: 'Midjourney', value: 'midjourney' },
  { label: 'Replicate', value: 'replicate' },
];

const DEFAULT_MODEL_OPTIONS = [{ label: 'All Models', value: '' }];

const DEFAULT_ACCOUNT_OPTIONS = [{ label: 'All Brands', value: '' }];

const DEFAULT_FILTER_OPTIONS = {};

const DEFAULT_VISIBLE_FILTERS = {
  favorite: false,
  format: true,
  model: false,
  provider: true,
  search: true,
  sort: true,
  status: true,
  type: true,
};

export default function FiltersBar({
  filters,
  onFiltersChange,
  className = '',
  filterOptions = DEFAULT_FILTER_OPTIONS,
  visibleFilters = DEFAULT_VISIBLE_FILTERS,
}: FiltersBarProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? '');

  // Notify parent of filter changes - all filters are now server-side
  const notifyFilterChange = useCallback(
    (newFilters: typeof filters) => {
      // Convert filters directly to query since all are server-side
      const query: IFilters = {};
      Object.entries(newFilters).forEach(([key, value]) => {
        // Only add to query if value is not undefined or null
        // Empty strings should be included (for "All" and "None" filters)
        if (value !== undefined && value !== null) {
          query[key as keyof IFilters] = value;
        }
      });
      onFiltersChange?.(newFilters, query);
    },
    [onFiltersChange],
  );

  useEffect(() => {
    setSearchValue(filters.search ?? '');
  }, [filters.search]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        notifyFilterChange({ ...filters, search: searchValue });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, filters, notifyFilterChange]);

  const updateFiltersBar = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === 'search') {
      setSearchValue(value);
    } else {
      notifyFilterChange({ ...filters, [name]: value });
    }
  };

  const handleDropdownChange = (name: string, value: string | string[]) => {
    notifyFilterChange({ ...filters, [name]: value });
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      brand: '',
      favorite: '',
      format: filters.format, // Keep current format (managed by PromptBar)
      model: '',
      provider: '',
      search: '',
      sort: '',
      status: [] as string[],
      type: '',
    };

    setSearchValue('');
    notifyFilterChange(clearedFilters);
  };

  const hasActiveFilters =
    (Array.isArray(filters.status)
      ? filters.status.length > 0
      : filters.status) ||
    filters.search ||
    // Don't count format as active filter (managed by PromptBar)
    filters.type ||
    filters.provider ||
    filters.model ||
    filters.sort ||
    filters.favorite ||
    filters.brand;

  // Use custom options if provided, otherwise use defaults
  const STATUS_OPTIONS = filterOptions.status || DEFAULT_STATUS_OPTIONS;
  const FORMAT_OPTIONS = filterOptions.format || DEFAULT_FORMAT_OPTIONS;
  const TYPE_OPTIONS = filterOptions.type || DEFAULT_TYPE_OPTIONS;
  const PROVIDER_OPTIONS = filterOptions.provider || DEFAULT_PROVIDER_OPTIONS;
  const MODEL_OPTIONS = filterOptions.model || DEFAULT_MODEL_OPTIONS;
  const SORT_OPTIONS = filterOptions.sort || DEFAULT_SORT_OPTIONS;
  const FAVORITE_OPTIONS = filterOptions.favorite || DEFAULT_FAVORITE_OPTIONS;
  const ACCOUNT_OPTIONS = filterOptions.brand || DEFAULT_ACCOUNT_OPTIONS;

  return (
    <div
      className={`flex w-full flex-wrap items-center gap-1.5 ${className}`}
      data-testid="filters-bar"
    >
      {/* Search */}
      {visibleFilters.search && (
        <div className="min-w-0 basis-56 max-w-96 flex-1">
          <FormSearchbar
            value={searchValue}
            onChange={updateFiltersBar}
            placeholder="Search label, description, or tags"
            size={ComponentSize.SM}
          />
        </div>
      )}

      {/* Filter Dropdowns Container */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {/* Status Filter */}
        {visibleFilters.status && (
          <DropdownMultiSelect
            name="status"
            values={
              typeof filters.status === 'string'
                ? filters.status
                  ? [filters.status]
                  : []
                : filters.status || []
            }
            options={STATUS_OPTIONS}
            onChange={(name, values) => handleDropdownChange(name, values)}
            placeholder="All Statuses"
          />
        )}

        {/* Format Filter */}
        {visibleFilters.format && (
          <ButtonDropdown
            name="format"
            value={filters.format}
            options={FORMAT_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Formats"
          />
        )}

        {/* Type Filter */}
        {visibleFilters.type && (
          <ButtonDropdown
            name="type"
            value={filters.type}
            options={TYPE_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Types"
          />
        )}

        {/* Provider Filter */}
        {visibleFilters.provider && (
          <ButtonDropdown
            name="provider"
            value={filters.provider}
            options={PROVIDER_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Providers"
          />
        )}

        {/* Model Filter */}
        {visibleFilters.model && (
          <ButtonDropdown
            name="model"
            value={filters.model ?? ''}
            options={MODEL_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Models"
          />
        )}

        {/* Sort By */}
        {visibleFilters.sort && (
          <ButtonDropdown
            name="sort"
            value={filters.sort ?? ''}
            options={SORT_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="Sort By"
          />
        )}

        {/* Favorite Filter */}
        {visibleFilters.favorite && (
          <ButtonDropdown
            name="favorite"
            value={filters.favorite ?? ''}
            options={FAVORITE_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Items"
          />
        )}

        {/* Account Filter */}
        {visibleFilters.brand && (
          <ButtonDropdown
            name="brand"
            value={filters.brand ?? ''}
            options={ACCOUNT_OPTIONS}
            onChange={handleDropdownChange}
            placeholder="All Brands"
          />
        )}
      </div>

      {/* Clear Filters Button — same icon size as dropdown chevrons / view toggle */}
      {hasActiveFilters && (
        <Button
          ariaLabel="Clear filters"
          className={`${SHELL_CONTROL_HEIGHT_CLASS} gap-1.5 px-2 text-xs font-medium text-foreground/70 hover:text-foreground`}
          icon={<X className={SHELL_ICON_CLASS} aria-hidden="true" />}
          label="Clear"
          onClick={handleClearFilters}
          size={ButtonSize.SM}
          textTransform="none"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
    </div>
  );
}
