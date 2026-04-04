'use client';

import type { IFilters } from '@genfeedai/interfaces/utils/filters.interface';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type { FiltersBarProps } from '@props/ui/forms/filters.props';
import Button from '@ui/buttons/base/Button';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineFunnel, HiXMark } from 'react-icons/hi2';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

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
  { label: 'All', value: '' },
  {
    icon: <MdOutlineCropSquare size={16} />,
    label: '1:1',
    value: IngredientFormat.SQUARE,
  },
  {
    icon: <MdOutlineCropLandscape size={16} />,
    label: '16:9',
    value: IngredientFormat.LANDSCAPE,
  },
  {
    icon: <MdOutlineCropPortrait size={16} />,
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

export default function FiltersButton({
  filters,
  onFiltersChange,
  className = '',
  filterOptions = {},
  visibleFilters = {
    favorite: false,
    format: true,
    model: false,
    provider: true,
    search: true,
    sort: true,
    status: true,
    type: true,
  },
}: FiltersBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const isInternalUpdateRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // portal content
  const triggerRef = useRef<HTMLDivElement>(null);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const insideDropdown = dropdownRef.current?.contains(target);
      const insideTrigger = triggerRef.current?.contains(target);

      // Check if click is inside a Radix portaled dropdown (ButtonDropdown or DropdownMultiSelect)
      const insideChildDropdown = !!target.closest(
        '[data-radix-popper-content-wrapper]',
      );

      if (!insideDropdown && !insideTrigger && !insideChildDropdown) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Position portal relative to trigger (align to right of trigger, open left)
  useEffect(() => {
    const updatePosition = () => {
      if (!isOpen || !triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const desiredWidth = Math.min(640, Math.max(400, window.innerWidth - 24));
      const left = Math.max(12, rect.right - desiredWidth);
      const top = rect.bottom + 8;
      setPortalCoords({ left, top, width: desiredWidth });
    };

    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  // Notify parent of filter changes
  const notifyFilterChange = useCallback(
    (newFilters: typeof filters) => {
      const query: IFilters = {};
      Object.entries(newFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query[key as keyof IFilters] = value;
        }
      });
      onFiltersChange?.(newFilters, query);
    },
    [onFiltersChange],
  );

  // Sync internal search value with external filters prop
  // Only update if the change came from external source (not from internal debounced update)
  useEffect(() => {
    if (!isInternalUpdateRef.current && filters.search !== searchValue) {
      requestAnimationFrame(() => {
        setSearchValue(filters.search ?? '');
      });
    }
    isInternalUpdateRef.current = false;
  }, [filters.search, searchValue]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        isInternalUpdateRef.current = true;
        notifyFilterChange({ ...filters, search: searchValue });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, filters, notifyFilterChange]);

  const handleChange = (
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
      category: '',
      favorite: '',
      format: '',
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
    filters.format ||
    filters.type ||
    filters.provider ||
    filters.model ||
    filters.sort ||
    filters.favorite ||
    filters.brand ||
    filters.category;

  // Use custom options if provided, otherwise use defaults
  const STATUS_OPTIONS = filterOptions.status || DEFAULT_STATUS_OPTIONS;
  const FORMAT_OPTIONS = filterOptions.format || DEFAULT_FORMAT_OPTIONS;
  const TYPE_OPTIONS = filterOptions.type || DEFAULT_TYPE_OPTIONS;
  const PROVIDER_OPTIONS = filterOptions.provider || DEFAULT_PROVIDER_OPTIONS;
  const MODEL_OPTIONS = filterOptions.model || DEFAULT_MODEL_OPTIONS;
  const SORT_OPTIONS = filterOptions.sort || DEFAULT_SORT_OPTIONS;
  const FAVORITE_OPTIONS = filterOptions.favorite || DEFAULT_FAVORITE_OPTIONS;
  const ACCOUNT_OPTIONS = filterOptions.brand || DEFAULT_ACCOUNT_OPTIONS;
  const CATEGORY_OPTIONS = filterOptions.category || [];

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      {/* Filter Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant={ButtonVariant.GHOST}
        icon={<HiOutlineFunnel className="h-4 w-4" />}
        tooltip="Filters"
      />

      {/* Dropdown Panel (portal to body to avoid clipping/overflow) */}
      {isOpen &&
        portalCoords &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-[#141414] border border-white/[0.06] shadow-2xl z-[10000] p-6 pointer-events-auto"
            style={{
              left: portalCoords.left,
              top: portalCoords.top,
              width: portalCoords.width,
            }}
          >
            <div className="flex flex-col gap-4 w-full">
              {/* Line 1: Search */}
              {visibleFilters.search && (
                <div className="w-full">
                  <FormSearchbar
                    value={searchValue}
                    onChange={handleChange}
                    placeholder="Search label, description, or tags"
                    size={ComponentSize.SM}
                  />
                </div>
              )}

              {/* Line 2: All dropdowns */}
              <div className="flex flex-wrap items-center gap-2 w-full">
                {visibleFilters.status && (
                  <DropdownMultiSelect
                    name="status"
                    placeholder="All Statuses"
                    options={STATUS_OPTIONS}
                    values={
                      typeof filters.status === 'string'
                        ? filters.status
                          ? [filters.status]
                          : []
                        : filters.status || []
                    }
                    onChange={(name, values) =>
                      handleDropdownChange(name, values)
                    }
                  />
                )}

                {visibleFilters.format && (
                  <ButtonDropdown
                    name="format"
                    value={filters.format}
                    options={FORMAT_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Formats"
                  />
                )}

                {visibleFilters.type && (
                  <ButtonDropdown
                    name="type"
                    value={filters.type}
                    options={TYPE_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Types"
                  />
                )}

                {visibleFilters.provider && (
                  <ButtonDropdown
                    name="provider"
                    value={filters.provider}
                    options={PROVIDER_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Providers"
                  />
                )}

                {visibleFilters.model && (
                  <ButtonDropdown
                    name="model"
                    value={filters.model ?? ''}
                    options={MODEL_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Models"
                  />
                )}

                {visibleFilters.sort && (
                  <ButtonDropdown
                    name="sort"
                    value={filters.sort ?? ''}
                    options={SORT_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="Sort By"
                  />
                )}

                {visibleFilters.favorite && (
                  <ButtonDropdown
                    name="favorite"
                    value={filters.favorite ?? ''}
                    options={FAVORITE_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Items"
                  />
                )}

                {visibleFilters.brand && (
                  <ButtonDropdown
                    name="brand"
                    value={filters.brand ?? ''}
                    options={ACCOUNT_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Brands"
                  />
                )}

                {visibleFilters.category && (
                  <ButtonDropdown
                    name="category"
                    value={filters.category ?? ''}
                    options={CATEGORY_OPTIONS}
                    onChange={handleDropdownChange}
                    placeholder="All Categories"
                  />
                )}

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <Button
                    label={
                      <>
                        <HiXMark className="text-lg" /> Clear
                      </>
                    }
                    onClick={handleClearFilters}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    className="w-full"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
