'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { IFieldOption } from '@genfeedai/interfaces';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import type { FiltersBarProps } from '@genfeedai/props/ui/forms/filters.props';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import type { ChangeEvent } from 'react';
import { HiXMark } from 'react-icons/hi2';

type FiltersPanelProps = {
  filters: IFiltersState;
  searchValue: string;
  hasActiveFilters: boolean;
  visibleFilters: NonNullable<FiltersBarProps['visibleFilters']>;
  statusOptions: readonly IFieldOption[];
  formatOptions: readonly IFieldOption[];
  typeOptions: readonly IFieldOption[];
  providerOptions: readonly IFieldOption[];
  modelOptions: readonly IFieldOption[];
  sortOptions: readonly IFieldOption[];
  favoriteOptions: readonly IFieldOption[];
  accountOptions: readonly IFieldOption[];
  categoryOptions: readonly IFieldOption[];
  onSearchChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  onDropdownChange: (name: string, value: string | string[]) => void;
  onClearFilters: () => void;
};

export default function FiltersPanel({
  filters,
  searchValue,
  hasActiveFilters,
  visibleFilters,
  statusOptions,
  formatOptions,
  typeOptions,
  providerOptions,
  modelOptions,
  sortOptions,
  favoriteOptions,
  accountOptions,
  categoryOptions,
  onSearchChange,
  onDropdownChange,
  onClearFilters,
}: FiltersPanelProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Line 1: Search */}
      {visibleFilters.search && (
        <div className="w-full">
          <FormSearchbar
            value={searchValue}
            onChange={onSearchChange}
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
            options={statusOptions}
            values={
              typeof filters.status === 'string'
                ? filters.status
                  ? [filters.status]
                  : []
                : filters.status || []
            }
            onChange={(name, values) => onDropdownChange(name, values)}
          />
        )}

        {visibleFilters.format && (
          <ButtonDropdown
            name="format"
            value={filters.format}
            options={formatOptions}
            onChange={onDropdownChange}
            placeholder="All Formats"
          />
        )}

        {visibleFilters.type && (
          <ButtonDropdown
            name="type"
            value={filters.type}
            options={typeOptions}
            onChange={onDropdownChange}
            placeholder="All Types"
          />
        )}

        {visibleFilters.provider && (
          <ButtonDropdown
            name="provider"
            value={filters.provider}
            options={providerOptions}
            onChange={onDropdownChange}
            placeholder="All Providers"
          />
        )}

        {visibleFilters.model && (
          <ButtonDropdown
            name="model"
            value={filters.model ?? ''}
            options={modelOptions}
            onChange={onDropdownChange}
            placeholder="All Models"
          />
        )}

        {visibleFilters.sort && (
          <ButtonDropdown
            name="sort"
            value={filters.sort ?? ''}
            options={sortOptions}
            onChange={onDropdownChange}
            placeholder="Sort By"
          />
        )}

        {visibleFilters.favorite && (
          <ButtonDropdown
            name="favorite"
            value={filters.favorite ?? ''}
            options={favoriteOptions}
            onChange={onDropdownChange}
            placeholder="All Items"
          />
        )}

        {visibleFilters.brand && (
          <ButtonDropdown
            name="brand"
            value={filters.brand ?? ''}
            options={accountOptions}
            onChange={onDropdownChange}
            placeholder="All Brands"
          />
        )}

        {visibleFilters.category && (
          <ButtonDropdown
            name="category"
            value={filters.category ?? ''}
            options={categoryOptions}
            onChange={onDropdownChange}
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
            onClick={onClearFilters}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            className="w-full"
          />
        )}
      </div>
    </div>
  );
}
